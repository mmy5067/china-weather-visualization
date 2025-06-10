import os
import json
import pandas as pd
from datetime import datetime
import glob

def process_csv_files():
    """
    处理所有CSV文件，按年月组织数据
    每个月只读取一行数据，提高处理效率
    """
    csv_folder = './csv'
    output_file = 'weather_data.json'
    
    # 存储所有数据的字典，按年月组织
    weather_data = {}
    # 记录每个站点每个月是否已有数据
    station_month_data = {}
    
    # 获取所有CSV文件
    csv_files = glob.glob(os.path.join(csv_folder, '*.csv'))
    
    print(f"找到 {len(csv_files)} 个CSV文件")
    
    processed_count = 0
    
    for csv_file in csv_files:
        try:
            # 读取CSV文件
            df = pd.read_csv(csv_file)
            
            # 检查必要的列是否存在
            required_columns = ['STATION', 'DATE', 'LATITUDE', 'LONGITUDE', 'NAME', 'TEMP', 'PRCP']
            if not all(col in df.columns for col in required_columns):
                print(f"跳过文件 {csv_file}: 缺少必要的列")
                continue
            
            # 获取站点ID
            station_id = None
            if not df.empty:
                station_id = str(df.iloc[0]['STATION'])
            
            # 处理每一行数据
            for _, row in df.iterrows():
                try:
                    # 解析日期
                    date_str = str(row['DATE'])
                    if len(date_str) >= 7:  # 确保日期格式正确
                        year_month = date_str[:7]  # 提取YYYY-MM
                        
                        # 检查该站点该月份是否已有数据
                        station_month_key = f"{station_id}_{year_month}"
                        if station_month_key in station_month_data:
                            continue  # 跳过，该站点该月份已有数据
                        
                        # 验证数据有效性
                        lat = float(row['LATITUDE'])
                        lng = float(row['LONGITUDE'])
                        
                        # 跳过无效坐标
                        if lat == 0.0 and lng == 0.0:
                            continue
                            
                        # 处理温度和降水数据
                        temp = None
                        prcp = None
                        
                        if pd.notna(row['TEMP']) and row['TEMP'] != '':
                            temp = float(row['TEMP'])
                            
                        if pd.notna(row['PRCP']) and row['PRCP'] != '':
                            prcp = float(row['PRCP'])
                        
                        # 只保留有温度或降水数据的记录
                        if temp is not None or prcp is not None:
                            # 初始化年月数据结构
                            if year_month not in weather_data:
                                weather_data[year_month] = []
                            
                            # 添加数据点
                            data_point = {
                                'station_id': station_id,
                                'lat': lat,
                                'lng': lng,
                                'name': str(row['NAME']).replace('"', ''),
                                'temperature': temp,
                                'precipitation': prcp
                            }
                            
                            weather_data[year_month].append(data_point)
                            
                            # 标记该站点该月份已有数据
                            station_month_data[station_month_key] = True
                            
                except (ValueError, TypeError) as e:
                    # 跳过无效的数据行
                    continue
            
            processed_count += 1
            if processed_count % 50 == 0:
                print(f"已处理 {processed_count} 个文件...")
                
        except Exception as e:
            print(f"处理文件 {csv_file} 时出错: {e}")
            continue
    
    # 按年月排序
    sorted_data = dict(sorted(weather_data.items()))
    
    # 生成统计信息
    stats = {
        'total_months': len(sorted_data),
        'date_range': {
            'start': min(sorted_data.keys()) if sorted_data else None,
            'end': max(sorted_data.keys()) if sorted_data else None
        },
        'total_records': sum(len(records) for records in sorted_data.values()),
        'unique_stations': len(set(station_month_data.keys()))
    }
    
    # 保存处理后的数据
    output_data = {
        'metadata': stats,
        'data': sorted_data
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n数据处理完成！")
    print(f"总共处理了 {processed_count} 个CSV文件")
    print(f"生成了 {stats['total_months']} 个月的数据")
    print(f"总记录数: {stats['total_records']}")
    print(f"唯一站点月份组合: {stats['unique_stations']}")
    print(f"日期范围: {stats['date_range']['start']} 到 {stats['date_range']['end']}")
    print(f"输出文件: {output_file}")

if __name__ == '__main__':
    process_csv_files()