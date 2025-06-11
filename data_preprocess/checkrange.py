import os
import pandas as pd

# --- 配置参数 ---
DIRECTORY_PATH = "processed_cn_gsod"  # 目标目录
MIN_LAT, MAX_LAT = 3, 54
MIN_LON, MAX_LON = 73, 136

# 尝试可能的经纬度及名称列名
lat_col_candidates = ['LATITUDE', 'LAT', 'lat', '纬度', 'Latitude']
lon_col_candidates = ['LONGITUDE', 'LON', 'lon', '经度', 'Longitude']
name_col_candidates = ['NAME', 'STATION_NAME', 'Name', '名称', '站点名称']

# --- 主逻辑 ---
def find_column(df_columns, candidates):
    """在DataFrame的列中查找第一个匹配的候选列名"""
    for col_name in candidates:
        if col_name in df_columns:
            return col_name
    return None

def get_station_name_from_df(df_head, name_col):
    """Safely extracts station name from the dataframe if the column exists."""
    if name_col and name_col in df_head.columns:
        try:
            # Ensure we get a string, handle potential non-string data
            name_series = df_head[name_col].dropna()
            if not name_series.empty:
                return str(name_series.iloc[0])
            return "Name column present but no data"
        except IndexError:
            return "Name column present but no data"
        except Exception as e:
            return f"Error reading name: {e}"
    return "Name column not found or N/A"

def process_files_in_directory(directory):
    out_of_bounds_stations_info = []
    general_problematic_files = [] # For general file processing issues (e.g., empty, read error)
    special_coord_issue_stations = [] # For (0,0) or missing/invalid coordinates or BOGUS name

    if not os.path.isdir(directory):
        print(f"错误：目录 '{directory}' 不存在。")
        return [], [], []

    print(f"开始处理目录: {directory}")
    print(f"有效地理范围: 纬度 {MIN_LAT}-{MAX_LAT}, 经度 {MIN_LON}-{MAX_LON}\n")

    for filename in os.listdir(directory):
        if filename.lower().endswith(".csv"):
            file_path = os.path.join(directory, filename)
            print(f"正在检查文件: {filename} ...")
            station_name_from_csv = "N/A" # Default
            # is_file_problematic_for_deletion = False # Not directly used for decision anymore, logic flows to special_coord_issue_stations
            # issue_for_deletion = "" # Not directly used for decision anymore

            try:
                df_head = pd.read_csv(file_path, nrows=5, encoding='utf-8', skipinitialspace=True)

                if df_head.empty:
                    print(f"  文件 {filename} 为空，跳过。")
                    general_problematic_files.append({
                        "filename": filename,
                        "station_name_csv": "N/A", # Name might not be readable
                        "issue": "文件为空"
                    })
                    continue

                name_col_actual = find_column(df_head.columns, name_col_candidates)
                station_name_from_csv = get_station_name_from_df(df_head, name_col_actual)

                # Check for "BOGUS" in station name first
                if "bogus" in station_name_from_csv.lower():
                    print(f"  警告: 站点 {filename} (名称: \"{station_name_from_csv}\") 名称包含 'BOGUS'，建议删除。")
                    special_coord_issue_stations.append({
                        "filename": filename,
                        "station_name_csv": station_name_from_csv,
                        "latitude": "N/A", # Coordinates not checked yet for this specific path
                        "longitude": "N/A",
                        "issue": "站点名包含 'BOGUS'",
                        "propose_delete": True
                    })
                    print("-" * 20)
                    continue # Move to next file

                lat_col = find_column(df_head.columns, lat_col_candidates)
                lon_col = find_column(df_head.columns, lon_col_candidates)

                if not lat_col or not lon_col:
                    msg = f"在文件 {filename} 中未找到预期的经纬度列。"
                    print(f"  警告: {msg}")
                    special_coord_issue_stations.append({
                        "filename": filename,
                        "station_name_csv": station_name_from_csv,
                        "latitude": "N/A",
                        "longitude": "N/A",
                        "issue": "经纬度列名未找到",
                        "propose_delete": True
                    })
                    print("-" * 20)
                    continue # Continue to next file after logging

                raw_lat_val, raw_lon_val = "N/A", "N/A"
                station_lat, station_lon = None, None # Initialize
                try:
                    if not df_head[lat_col].dropna().empty:
                        raw_lat_val = df_head[lat_col].dropna().iloc[0]
                    if not df_head[lon_col].dropna().empty:
                        raw_lon_val = df_head[lon_col].dropna().iloc[0]
                    
                    station_lat = float(raw_lat_val)
                    station_lon = float(raw_lon_val)

                except (IndexError, ValueError) as e_val:
                    msg = f"无法从文件 {filename} 的列 '{lat_col}', '{lon_col}' 提取有效的经纬度值 (原始值 Lat: {raw_lat_val}, Lon: {raw_lon_val})。错误: {e_val}"
                    print(f"  警告: {msg}")
                    special_coord_issue_stations.append({
                        "filename": filename,
                        "station_name_csv": station_name_from_csv,
                        "latitude": str(raw_lat_val),
                        "longitude": str(raw_lon_val),
                        "issue": f"无效的经纬度值: {e_val}",
                        "propose_delete": True
                    })
                    print("-" * 20)
                    continue # Continue to next file

                if station_lat == 0.0 and station_lon == 0.0:
                    print(f"  注意: 站点 {filename} (名称: \"{station_name_from_csv}\") 经纬度为 (0.0, 0.0)。")
                    existing_issue_entry = next((s for s in special_coord_issue_stations if s["filename"] == filename), None)
                    if not existing_issue_entry: 
                        special_coord_issue_stations.append({
                            "filename": filename,
                            "station_name_csv": station_name_from_csv,
                            "latitude": station_lat,
                            "longitude": station_lon,
                            "issue": "经纬度为 (0.0, 0.0)",
                            "propose_delete": False 
                        })

                is_within_bounds = (MIN_LAT <= station_lat <= MAX_LAT) and \
                                   (MIN_LON <= station_lon <= MAX_LON)

                if not is_within_bounds:
                    is_already_proposed_for_delete = any(s["filename"] == filename and s.get("propose_delete") for s in special_coord_issue_stations)
                    if not is_already_proposed_for_delete:
                        print(f"  站点 {filename} (名称: \"{station_name_from_csv}\", Lat: {station_lat:.2f}, Lon: {station_lon:.2f}) 在范围之外 (将保留)。")
                        out_of_bounds_stations_info.append({
                            "filename": filename,
                            "station_name_csv": station_name_from_csv,
                            "latitude": station_lat,
                            "longitude": station_lon,
                            "reason": "超出地理范围 (将保留)"
                        })
                else: 
                    is_problematic_or_zero = any(s["filename"] == filename for s in special_coord_issue_stations) # Check if any issue (incl. 0,0) was logged
                    if not is_problematic_or_zero:
                         print(f"  站点 {filename} (名称: \"{station_name_from_csv}\", Lat: {station_lat:.2f}, Lon: {station_lon:.2f}) 在范围内，数据有效，保留。")

            except pd.errors.EmptyDataError: 
                print(f"  文件 {filename} 为空或格式错误 (pandas EmptyDataError)，跳过。")
                general_problematic_files.append({
                    "filename": filename,
                    "station_name_csv": station_name_from_csv, 
                    "issue": "Pandas读取空数据错误"
                })
            except Exception as e:
                print(f"  处理文件 {filename} 时发生未知错误: {e}")
                general_problematic_files.append({
                    "filename": filename,
                    "station_name_csv": station_name_from_csv, 
                    "issue": f"未知处理错误: {e}"
                })
            print("-" * 20)

    return out_of_bounds_stations_info, general_problematic_files, special_coord_issue_stations

if __name__ == "__main__":
    # !! 再次提醒：运行前请备份数据 !!
    out_of_bounds_stations, general_problem_files, special_coord_files = process_files_in_directory(DIRECTORY_PATH)

    deleted_csv_files = [] 
    deleted_json_files = [] 

    candidate_files_for_deletion = [
        s for s in special_coord_files if s.get("propose_delete")
    ]

    if candidate_files_for_deletion:
        print("\n--- 确认删除以下有问题的站点文件 (CSV及其对应的JSON) ---")
        for station_info in candidate_files_for_deletion:
            print(f"  文件名 (CSV): {station_info['filename']}, "
                  f"CSV内站点名: \"{station_info['station_name_csv']}\", "
                  f"问题: {station_info['issue']}")
            
            base_filename, _ = os.path.splitext(station_info['filename'])
            json_filename_to_delete = base_filename + ".json"
            json_file_path_to_delete = os.path.join(DIRECTORY_PATH, json_filename_to_delete)

            while True:
                confirm = input(f"    是否确认删除 '{station_info['filename']}' 和 '{json_filename_to_delete}' (如果存在)? (y/n): ").strip().lower()
                if confirm == 'y':
                    csv_file_path_to_delete = os.path.join(DIRECTORY_PATH, station_info['filename'])
                    try:
                        os.remove(csv_file_path_to_delete)
                        print(f"    文件 '{station_info['filename']}' 已删除。")
                        deleted_csv_files.append(station_info['filename'])
                    except OSError as e:
                        print(f"    错误: 删除CSV文件 '{station_info['filename']}' 失败: {e}")
                    
                    if os.path.exists(json_file_path_to_delete):
                        try:
                            os.remove(json_file_path_to_delete)
                            print(f"    文件 '{json_filename_to_delete}' 已删除。")
                            deleted_json_files.append(json_filename_to_delete)
                        except OSError as e:
                            print(f"    错误: 删除JSON文件 '{json_filename_to_delete}' 失败: {e}")
                    else:
                        print(f"    JSON文件 '{json_filename_to_delete}' 未找到，无需删除。")
                    break
                elif confirm == 'n':
                    print(f"    文件 '{station_info['filename']}' (及对应JSON) 已保留。")
                    break
                else:
                    print("    无效输入，请输入 'y' 或 'n'。")
    else:
        print("\n没有因站点名含BOGUS、经纬度无效或缺失问题而建议删除的文件。")

    # --- 结果报告 ---
    print("\n\n--- 操作总结 ---")

    if deleted_csv_files:
        print("\n以下CSV文件因有问题 (站点名含BOGUS、经纬度无效/缺失)并经用户确认后被删除：")
        for filename in deleted_csv_files:
            station_details = next((s for s in candidate_files_for_deletion if s['filename'] == filename), None)
            if station_details:
                 print(f"- CSV 文件名: {filename}, CSV内站点名: \"{station_details['station_name_csv']}\", 问题: {station_details['issue']}")
            else:
                print(f"- CSV 文件名: {filename} (详情未找到，但已删除)")
    if deleted_json_files:
        print("\n以下JSON文件因其对应的CSV文件被删除而被删除：")
        for filename in deleted_json_files:
            print(f"- JSON 文件名: {filename}")
    
    if not deleted_csv_files and not deleted_json_files:
        print("\n没有文件在此次运行中被删除。")

    remaining_special_coord_files = [
        s for s in special_coord_files if s['filename'] not in deleted_csv_files 
    ]
    if remaining_special_coord_files:
        print("\n以下站点存在特殊问题（如0,0坐标、或曾提议删除但用户选择保留），文件已保留：")
        for station in remaining_special_coord_files:
            print(f"- 文件名: {station['filename']}, "
                  f"CSV内站点名: \"{station['station_name_csv']}\", "
                  f"报告纬度: {station['latitude']}, "
                  f"报告经度: {station['longitude']}, "
                  f"问题: {station['issue']}")
    else:
        if not special_coord_files: 
            print("\n未发现需要特别关注的站点（如坐标无效、名称含BOGUS、0,0坐标等）。")
        elif candidate_files_for_deletion and not deleted_csv_files and not deleted_json_files : # Had candidates but none were deleted by user
            print("\n所有最初标记有问题的站点（坐标无效、名称含BOGUS等）均因用户选择而被保留。")
        elif special_coord_files and not candidate_files_for_deletion: # Had special files (e.g. 0,0) but none proposed for deletion
             print("\n未发现提议删除的站点，但可能存在0,0坐标等已记录的特殊情况站点。")
        else: 
            print("\n所有最初标记有问题的站点（坐标无效、名称含BOGUS等提议删除项）似乎均已处理（删除）。")


    if out_of_bounds_stations:
        print("\n以下站点文件因超出指定地理范围而被识别（已保留）：")
        for station in out_of_bounds_stations:
            print(f"- 文件名: {station['filename']}, "
                  f"CSV内站点名: \"{station['station_name_csv']}\", "
                  f"纬度: {station['latitude']:.2f}, "
                  f"经度: {station['longitude']:.2f}, "
                  f"原因: {station['reason']}")
    else:
        print("\n没有文件因超出地理范围而被识别。")

    if general_problem_files:
        print("\n处理过程中遇到一般问题的站点文件（已保留）：")
        for p_file in general_problem_files:
            print(f"- 文件名: {p_file['filename']}, CSV内站点名: \"{p_file['station_name_csv']}\", 问题: {p_file['issue']}")

    print("\n处理完成。")