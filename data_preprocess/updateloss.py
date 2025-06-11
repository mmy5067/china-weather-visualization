import os
import pandas as pd
import io
import json

# --- Configuration ---
DIRECTORY_PATH = "processed_cn_gsod"  # Directory containing the CSV files
LAT_COL_CANDIDATES_CSV = ['LATITUDE', 'LAT', 'lat', '纬度', 'Latitude']
LON_COL_CANDIDATES_CSV = ['LONGITUDE', 'LON', 'lon', '经度', 'Longitude']

# For JSON files, common keys for latitude and longitude
LAT_KEY_CANDIDATES_JSON = ['latitude', 'lat', 'Latitude', 'LAT']
LON_KEY_CANDIDATES_JSON = ['longitude', 'lon', 'Longitude', 'LON']


# --- Helper function to find column/key ---
def find_key_or_column(data_object, candidates):
    """
    Finds the first matching candidate key in a dictionary or column in a DataFrame.
    For DataFrame, it checks data_object.columns.
    For dict, it checks data_object.keys().
    """
    if isinstance(data_object, pd.DataFrame):
        collection = data_object.columns
    elif isinstance(data_object, dict):
        collection = data_object.keys()
    else:
        return None

    for key_name in candidates:
        if key_name in collection:
            return key_name
    return None

# --- Main update function ---
def update_csv_and_json_coordinates(directory, csv_filename, new_lat, new_lon, station_name_for_log="N/A"):
    """
    Updates the latitude and longitude in the first row of a given CSV file
    and its corresponding JSON file if it exists.
    """
    csv_file_path = os.path.join(directory, csv_filename)
    base_filename, _ = os.path.splitext(csv_filename)
    json_filename = base_filename + ".json"
    json_file_path = os.path.join(directory, json_filename)

    print(f"\nProcessing CSV: {csv_filename} (Station: \"{station_name_for_log}\")")
    csv_updated = False
    json_updated = False

    # --- Update CSV ---
    if not os.path.exists(csv_file_path):
        print(f"  ERROR (CSV): File '{csv_filename}' not found in '{directory}'. Skipping CSV update.")
    else:
        try:
            df = pd.read_csv(csv_file_path, encoding='utf-8', skipinitialspace=True)
            if df.empty:
                print(f"  ERROR (CSV): File '{csv_filename}' is empty. Skipping CSV update.")
            else:
                lat_col_actual = find_key_or_column(df, LAT_COL_CANDIDATES_CSV)
                lon_col_actual = find_key_or_column(df, LON_COL_CANDIDATES_CSV)

                if not lat_col_actual:
                    print(f"  ERROR (CSV): Latitude column not found in '{csv_filename}'. Searched for: {LAT_COL_CANDIDATES_CSV}. Skipping CSV update.")
                elif not lon_col_actual:
                    print(f"  ERROR (CSV): Longitude column not found in '{csv_filename}'. Searched for: {LON_COL_CANDIDATES_CSV}. Skipping CSV update.")
                else:
                    try:
                        current_lat_csv = df.loc[0, lat_col_actual]
                        current_lon_csv = df.loc[0, lon_col_actual]
                        df.loc[0, lat_col_actual] = float(new_lat)
                        df.loc[0, lon_col_actual] = float(new_lon)
                        df.to_csv(csv_file_path, index=False, encoding='utf-8')
                        print(f"  SUCCESS (CSV): Updated '{csv_filename}'. Old (Lat,Lon): ({current_lat_csv},{current_lon_csv}) -> New (Lat,Lon): ({new_lat},{new_lon}).")
                        csv_updated = True
                    except ValueError:
                        print(f"  ERROR (CSV): Invalid new latitude '{new_lat}' or longitude '{new_lon}' for '{csv_filename}'. Must be numbers. Skipping CSV update.")
                    except KeyError:
                        print(f"  ERROR (CSV): Could not access row 0 for lat/lon columns in '{csv_filename}'. File might be structured differently or too short. Skipping CSV update.")
        except pd.errors.EmptyDataError:
            print(f"  ERROR (CSV): File '{csv_filename}' is empty or malformed (pandas EmptyDataError). Skipping CSV update.")
        except Exception as e:
            print(f"  ERROR (CSV): An unexpected error occurred while processing '{csv_filename}': {e}. Skipping CSV update.")

    # --- Update JSON (only if CSV was successfully updated or if we proceed regardless) ---
    # Let's attempt JSON update even if CSV failed, but report separately.
    # Or, only if csv_updated: if csv_updated:
    
    print(f"Processing JSON: {json_filename}")
    if not os.path.exists(json_file_path):
        print(f"  INFO (JSON): File '{json_filename}' not found. No JSON update performed.")
    else:
        try:
            with open(json_file_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            if not isinstance(json_data, dict):
                print(f"  ERROR (JSON): File '{json_filename}' does not contain a valid JSON object at the root. Skipping JSON update.")
            else:
                lat_key_actual = find_key_or_column(json_data, LAT_KEY_CANDIDATES_JSON)
                lon_key_actual = find_key_or_column(json_data, LON_KEY_CANDIDATES_JSON)

                updated_json_coords = False
                if lat_key_actual:
                    current_lat_json = json_data.get(lat_key_actual)
                    json_data[lat_key_actual] = float(new_lat)
                    print(f"  INFO (JSON): Updated '{lat_key_actual}' from {current_lat_json} to {new_lat} in '{json_filename}'.")
                    updated_json_coords = True
                else:
                    print(f"  WARNING (JSON): Latitude key not found in '{json_filename}'. Searched for: {LAT_KEY_CANDIDATES_JSON}.")

                if lon_key_actual:
                    current_lon_json = json_data.get(lon_key_actual)
                    json_data[lon_key_actual] = float(new_lon)
                    print(f"  INFO (JSON): Updated '{lon_key_actual}' from {current_lon_json} to {new_lon} in '{json_filename}'.")
                    updated_json_coords = True # Stays true if lat was also updated
                else:
                    print(f"  WARNING (JSON): Longitude key not found in '{json_filename}'. Searched for: {LON_KEY_CANDIDATES_JSON}.")
                
                if updated_json_coords: # Only save if at least one coordinate was found and updated
                    with open(json_file_path, 'w', encoding='utf-8') as f:
                        json.dump(json_data, f, indent=4, ensure_ascii=False)
                    print(f"  SUCCESS (JSON): File '{json_filename}' saved with updated coordinates.")
                    json_updated = True
                elif not lat_key_actual and not lon_key_actual:
                     print(f"  ERROR (JSON): Neither latitude nor longitude keys found in '{json_filename}'. No JSON update performed.")
                else:
                    print(f"  INFO (JSON): File '{json_filename}' not saved as only one or no coordinate keys were updated.")


        except json.JSONDecodeError:
            print(f"  ERROR (JSON): File '{json_filename}' is not a valid JSON file. Skipping JSON update.")
        except ValueError:
            print(f"  ERROR (JSON): Invalid new latitude '{new_lat}' or longitude '{new_lon}' for '{json_filename}' (conversion to float failed). Skipping JSON update.")
        except Exception as e:
            print(f"  ERROR (JSON): An unexpected error occurred while processing '{json_filename}': {e}. Skipping JSON update.")
            
    return csv_updated, json_updated


# --- Main script execution ---
if __name__ == "__main__":
    # Paste the multi-line string data here
    corrections_data_string = """文件名,站点名,修正纬度,修正经度
50845099999.csv,"NAME LOCATION UNKN, CH",43.95,116.07
50945099999.csv,"TA AN, CH",45.50,124.28
50954099999.csv,"CHAO YUAN, CH",45.52,125.07
52303099999.csv,"YA MAN SU, CH",41.90,100.20
52671099999.csv,"SALT LAKE, CH",36.80,99.08
52854099999.csv,"JIANG XI GOU, CH",36.58,100.75
52864099999.csv,"HUANG YUAN, CH",36.68,101.25
53376099999.csv,"BA DAO GOU, CH",40.40,115.50
53488099999.csv,"CHU LE P U, CH",40.97,112.53
53945099999.csv,"HUANG LONG, CH",35.58,109.83
53985099999.csv,"SHEN CHUANG, CH",35.53,110.50
54276099999.csv,"JING YU, CH",42.37,126.80
54336099999.csv,"TAI AN SOUTHEAST, CH",40.50,123.08
54338099999.csv,"PAN SHAN, CH",41.18,122.05
54378099999.csv,"CHING ZHI, CH",41.27,119.73
54529099999.csv,"CHAI SHANG, CH",39.73,116.95
54614099999.csv,"HE JIAN, CH",38.43,116.08
54625099999.csv,"QI KOU, CH",38.95,118.88
54723099999.csv,"ZHAN CHENG, CH",37.68,118.13
54726099999.csv,"BIN XIAN, CH",37.49,118.13
54743099999.csv,"NAME UNKNOWN, CH",36.70,117.05
54853099999.csv,"NANWU, CH",35.20,118.83
54923099999.csv,"MENG YIN, CH",35.70,117.92
56023099999.csv,"NAME LOCATION UNKN, CH",31.48,92.07
56036099999.csv,"CANG DUO, CH",31.22,96.60
56089099999.csv,"BAI GU SI, CH",32.93,97.02
56138099999.csv,"QING NI DONG, CH",31.62,99.00
56147099999.csv,"CHUN LUO SI, CH",31.75,99.90
56237099999.csv,"BANG DA, CH",30.05,98.27
56375099999.csv,"HAN YUAN JIE, CH",29.35,102.68
56384099999.csv,"E BIAN, CH",29.23,102.77
56472099999.csv,"GAN LUO, CH",28.97,102.77
56474099999.csv,"MIAN NING, CH",28.55,102.17
56561099999.csv,"DA CUN, CH",27.50,103.22
56581099999.csv,"TIAN DI BA, CH",26.85,102.78
56674099999.csv,"OGUS CHINESE, CH",26.53,101.73
56915099999.csv,"NAME LOCATION UNKN, CH",24.45,98.60
56916099999.csv,"NAME LOCATION UNKN, CH",24.43,98.33
56979099999.csv,"JIE JIE, CH",23.73,103.25
56982099999.csv,"KAI YUAN, CH",23.70,103.25
57063099999.csv,"MIAN CHI, CH",34.77,111.77
57093099999.csv,"NAO KAO, CH",21.48,101.57
57128099999.csv,"YANG XIAN, CH",33.22,107.55
57137099999.csv,"SHI QUAN, CH",33.05,108.25
57457099999.csv,"GUAN DIAN GOU, CH",30.67,108.03
57466099999.csv,"JIANG KOU, CH",29.28,107.88
57477099999.csv,"SHA SHI, CH",30.32,112.25
57525099999.csv,"XIANG GOU, CH",29.53,106.57
57527099999.csv,"NAN CHUAN, CH",29.15,107.10
57597099999.csv,"MA AO, CH",29.60,121.80
57607099999.csv,"DA BA, CH",29.00,107.87
57623099999.csv,"CHEN NAN, CH",28.97,110.32
57632099999.csv,"CHANG PU QI, CH",28.17,113.62
57645099999.csv,"HUA YUAN, CH",27.90,109.83
57663099999.csv,"HAN SHOU, CH",28.90,111.97
57666099999.csv,"MA JI TANG, CH",27.52,110.40
57672099999.csv,"YUAN JIANG, CH",28.85,112.35
57732099999.csv,"DE WANG, CH",26.80,109.17
57792099999.csv,"YI CHUN, CH",27.80,114.38
57813099999.csv,"YANG CHANG, CH",27.55,111.50
57958099999.csv,"NAME UNKNOWN, CH",26.23,111.62
57966099999.csv,"NING YUAN, CH",25.60,111.95
57973099999.csv,"GUI YANG, CH",26.58,106.72
57983099999.csv,"NAME UNKNOWN, CH",25.83,105.18
58202099999.csv,"TSAOCHUANG, CH",32.97,117.90
58211099999.csv,"YING SHANG, CH",32.63,116.27
58231099999.csv,"JIA SHAN, CH",30.83,121.02
58252099999.csv,"AN FENG, CH",32.40,119.57
58323099999.csv,"SHIH TANG JIAO BASE, CH",31.33,121.50
58324099999.csv,"SHAN HE, CH",30.23,118.12
58327099999.csv,"KONG CHENG, CH",31.65,118.48
58438099999.csv,"JING DE, CH",30.28,117.57
58447099999.csv,"HE QIAO, CH",30.72,118.95
58456099999.csv,"HUANG WAN, CH",29.83,121.52
58458099999.csv,"SHAO XING, CH",30.00,120.58
58462099999.csv,"MIN HANG, CH",31.00,121.40
58467099999.csv,"YU YAO, CH",30.05,121.15
58478099999.csv,"ZHI ZHI ISLAND, CH",30.85,122.87
58654099999.csv,"JIN YUN, CH",28.65,120.05
58655099999.csv,"YONG LIN, CH",28.37,121.38
58713099999.csv,"HUANG SHI DU, CH",26.83,118.93
58734099999.csv,"JIAN YANG, CH",27.33,118.12
58736099999.csv,"XIONG MOUNTAIN, CH",27.00,117.67
58747099999.csv,"LI MEN, CH",27.33,119.92
58749099999.csv,"FU AN, CH",27.10,119.65
58753099999.csv,"RUI AN, CH",27.78,120.63
58848099999.csv,"SANYA, CH",18.23,109.52
58854099999.csv,"XI YANG ISLAND, CH",16.83,112.33
58864099999.csv,"TUNG YIN ISLAND, CH",26.37,120.50
58932099999.csv,"NAME UNKNOWN ONC, CH",24.97,118.58
58934099999.csv,"YONG CHUN, CH",25.33,118.30
59076099999.csv,"NAME UNKNOWN ONC, CH",23.73,114.68
59077099999.csv,"XIA SHUI XU, CH",23.42,114.93
59086099999.csv,"XIN JIANG, CH",23.17,114.42
59092099999.csv,"CHENG LONG, CH",22.70,114.57
59097099999.csv,"XINFENG, CH",24.07,114.20
59109099999.csv,"XING NING, CH",24.15,115.73
59217099999.csv,"RONG LAO XIANG, CH",22.87,110.87
59234099999.csv,"QIAO LI, CH",22.68,110.20
59258099999.csv,"LIU CHEN, CH",22.35,110.17
59277099999.csv,"LU BU, CH",23.18,112.28
59288099999.csv,"GUANG ZHOU EAST, CH",23.12,113.32
59297099999.csv,"BO LUO, CH",23.17,114.28
59326099999.csv,"XIONG DI ISLAND, CH",20.88,113.20
59473099999.csv,"HE QING, CH",22.70,110.35
59622099999.csv,"DONG JIAO, CH",20.03,110.35
59633099999.csv,"BAI MU, CH",19.73,110.80
59648099999.csv,"FOU TOU, CH",19.93,110.58
59683099999.csv,"BEI JIAN ISLAND, CH",21.05,111.30
59745099999.csv,"XI CUN, CH",20.25,110.20
59748099999.csv,"LIN GAO CAPE, CH",20.00,109.70
59755099999.csv,"CHIN HO CHIN NANG, CH",19.52,110.80
59848099999.csv,"BAI SHA, CH",19.23,109.43
59938099999.csv,"HUANG LIU, CH",18.50,108.80
59945099999.csv,"BAO TING, CH",18.64,109.70
"""

    print("--- Starting Coordinate Update Process ---")
    print(f"IMPORTANT: This script will modify files in '{DIRECTORY_PATH}'.")
    print("Ensure you have a backup if necessary.")
    
    try:
        # Use pandas to read the corrections data string for robustness
        corrections_df = pd.read_csv(io.StringIO(corrections_data_string))
    except Exception as e:
        print(f"\nFATAL ERROR: Could not parse the corrections data string: {e}")
        print("Please ensure the data is in the correct CSV format.")
        exit()

    successful_csv_updates = 0
    successful_json_updates = 0
    failed_csv_updates = 0
    failed_json_attempts = 0 # Counts files where JSON update was attempted but might have failed or keys not found

    for index, row in corrections_df.iterrows():
        try:
            filename = row['文件名']
            station_name = row['站点名']
            new_lat = row['修正纬度']
            new_lon = row['修正经度']
        except KeyError as e:
            print(f"\nERROR: Missing expected column {e} in corrections data row {index+2}. Skipping row: {row.to_dict()}")
            # Since we can't get filename, we can't count it as a CSV or JSON failure specifically for a file
            continue

        if pd.isna(filename) or pd.isna(new_lat) or pd.isna(new_lon):
            print(f"\nERROR: Missing data in corrections row {index+2} (Filename: {filename}, Lat: {new_lat}, Lon: {new_lon}). Skipping.")
            # Similar to above, can't attribute failure to a specific file type if filename is NaN
            continue
            
        csv_success, json_success = update_csv_and_json_coordinates(DIRECTORY_PATH, str(filename), new_lat, new_lon, str(station_name))
        
        if csv_success:
            successful_csv_updates += 1
        else:
            failed_csv_updates += 1
        
        # For JSON, we count success if it was updated.
        # If JSON file existed and was attempted, it's either a success or a failed attempt.
        json_file_path = os.path.join(DIRECTORY_PATH, os.path.splitext(str(filename))[0] + ".json")
        if os.path.exists(json_file_path): # If JSON file exists, an attempt was made or will be made
            if json_success:
                successful_json_updates += 1
            else:
                failed_json_attempts +=1 # This counts if JSON existed but wasn't successfully updated (e.g. key not found, error)
        # If JSON file doesn't exist, it's not counted as a failed attempt, it's just 'not found'.

    print("\n--- Update Process Summary ---")
    print(f"Successfully updated CSV files: {successful_csv_updates}")
    print(f"Failed to update CSV files (or file not found/empty): {failed_csv_updates}")
    print(f"Successfully updated JSON files: {successful_json_updates}")
    print(f"Attempted JSON updates that did not succeed (e.g., file existed but keys not found, or error): {failed_json_attempts}")
    print("Note: JSON files not found are reported during processing but not counted as 'failed attempts' here.")
    print("------------------------------")