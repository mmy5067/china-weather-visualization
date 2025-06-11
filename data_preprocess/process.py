import pandas as pd
import numpy as np
import os
import json # Added for JSON output

# --- Configuration ---
INPUT_BASE_DIR = "cn_gsod"
OUTPUT_BASE_DIR = "processed_cn_gsod"
# Official GSOD missing value indicators by field type
MISSING_VALUE_INDICATORS = ['99.99', '999.9', '9999.9', '9999.99']

# --- Conversion Functions ---
def fahrenheit_to_celsius(f_temp):
    """Converts Fahrenheit to Celsius."""
    return (pd.to_numeric(f_temp, errors='coerce') - 32.0) * 5.0 / 9.0

def inches_to_mm(inches):
    """Converts inches to millimeters."""
    return pd.to_numeric(inches, errors='coerce') * 25.4

def miles_to_meters(miles):
    """Converts miles to meters. GSOD VISIB is typically in miles."""
    return pd.to_numeric(miles, errors='coerce') * 1609.34

def knots_to_mps(knots):
    """Converts knots to meters per second."""
    return pd.to_numeric(knots, errors='coerce') * 0.514444

def calculate_relative_humidity(temp_c_series, dewp_c_series):
    """
    Calculates relative humidity from temperature and dew point in Celsius.
    Uses the Magnus-Tetens formula approximation.
    """
    # Ensure inputs are numeric
    temp_c = pd.to_numeric(temp_c_series, errors='coerce')
    dewp_c = pd.to_numeric(dewp_c_series, errors='coerce')

    # Saturation vapor pressure at dew point
    e_dewp = 0.61094 * np.exp((17.625 * dewp_c) / (243.04 + dewp_c))
    # Saturation vapor pressure at air temperature
    e_temp = 0.61094 * np.exp((17.625 * temp_c) / (243.04 + temp_c))
    
    rh = 100 * (e_dewp / e_temp)
    
    # Clip values to the valid range [0, 100] and handle NaNs
    rh = rh.replace([np.inf, -np.inf], np.nan)
    return rh.clip(0, 100)

def process_file(file_path):
    """Reads and processes a single GSOD CSV file."""
    try:
        df = pd.read_csv(file_path, 
                         skipinitialspace=True, 
                         na_values=MISSING_VALUE_INDICATORS,
                         dtype={'FRSHTT': str}) # Keep FRSHTT as string
        
        if df.empty:
            print(f"Warning: Empty file skipped: {file_path}")
            return None

        # Unit Conversions
        df['TEMP'] = fahrenheit_to_celsius(df.get('TEMP'))
        df['DEWP'] = fahrenheit_to_celsius(df.get('DEWP'))
        df['MAX'] = fahrenheit_to_celsius(df.get('MAX'))
        df['MIN'] = fahrenheit_to_celsius(df.get('MIN'))
        
        df['PRCP'] = inches_to_mm(df.get('PRCP'))
        df['SNDP'] = inches_to_mm(df.get('SNDP')) # Assuming SNDP is also in inches like PRCP
        
        df['VISIB'] = miles_to_meters(df.get('VISIB'))
        df['WDSP'] = knots_to_mps(df.get('WDSP'))

        # Calculate Relative Humidity
        if 'TEMP' in df.columns and 'DEWP' in df.columns:
            df['HMD'] = calculate_relative_humidity(df['TEMP'], df['DEWP'])
        else:
            df['HMD'] = np.nan
            
        # Drop unwanted columns
        cols_to_drop = [col for col in df.columns if col.endswith('_ATTRIBUTES')]
        cols_to_drop.extend(['MXSPD', 'GUST'])
        
        existing_cols_to_drop = [col for col in cols_to_drop if col in df.columns]
        df.drop(columns=existing_cols_to_drop, inplace=True)

        # Convert DATE column to datetime objects
        df['DATE'] = pd.to_datetime(df['DATE'], errors='coerce')
        df.dropna(subset=['DATE'], inplace=True) # Remove rows where date conversion failed

        return df

    except Exception as e:
        print(f"Error processing file {file_path}: {e}")
        return None

def main():
    if not os.path.exists(INPUT_BASE_DIR):
        print(f"Input directory not found: {INPUT_BASE_DIR}")
        return

    if not os.path.exists(OUTPUT_BASE_DIR):
        os.makedirs(OUTPUT_BASE_DIR)
        print(f"Created output directory: {OUTPUT_BASE_DIR}")

    all_station_data = {} # Dictionary to hold DataFrames for each station

    print("Starting GSOD data processing...")
    for year_folder in sorted(os.listdir(INPUT_BASE_DIR)):
        year_path = os.path.join(INPUT_BASE_DIR, year_folder)
        if os.path.isdir(year_path):
            print(f"Processing year: {year_folder}")
            for filename in os.listdir(year_path):
                if filename.lower().endswith('.csv'):
                    file_path = os.path.join(year_path, filename)
                    # print(f"  Processing file: {filename}")
                    processed_df = process_file(file_path)
                    
                    if processed_df is not None and not processed_df.empty:
                        # Assuming 'STATION' column exists and is consistent
                        station_id = str(processed_df['STATION'].iloc[0]) # Ensure station_id is a string
                        if station_id not in all_station_data:
                            all_station_data[station_id] = []
                        all_station_data[station_id].append(processed_df)
    
    print("\nConsolidating and saving data for each station...")
    final_columns_order = [
        "STATION", "DATE", "LATITUDE", "LONGITUDE", "ELEVATION", "NAME", 
        "TEMP", "DEWP", "SLP", "STP", "VISIB", "WDSP", 
        "MAX", "MIN", "PRCP", "SNDP", "FRSHTT", "HMD"
    ]

    for station_id, df_list in all_station_data.items():
        if not df_list:
            continue
        
        print(f"  Saving data for station: {station_id}")
        combined_df = pd.concat(df_list, ignore_index=True)
        
        # Sort by date
        combined_df.sort_values(by='DATE', inplace=True)
        
        # Ensure all final columns exist, fill with NaN if not, and set order
        for col in final_columns_order:
            if col not in combined_df.columns:
                combined_df[col] = np.nan
        combined_df = combined_df[final_columns_order]

        # Convert DATE to string for JSON serialization
        json_df = combined_df.copy()
        json_df['DATE'] = json_df['DATE'].dt.strftime('%Y-%m-%d')

        # Replace NaN with None for JSON compatibility
        json_df = json_df.replace({np.nan: None})

        # --- Save CSV ---
        output_csv_file_path = os.path.join(OUTPUT_BASE_DIR, f"{station_id}.csv")
        try:
            combined_df.to_csv(output_csv_file_path, index=False, date_format='%Y-%m-%d')
        except Exception as e:
            print(f"Error saving CSV file {output_csv_file_path}: {e}")

        # --- Save JSON ---
        output_json_file_path = os.path.join(OUTPUT_BASE_DIR, f"{station_id}.json")
        try:
            # Convert DataFrame to a list of dictionaries (records orient)
            records = json_df.to_dict(orient='records')
            with open(output_json_file_path, 'w', encoding='utf-8') as f:
                json.dump(records, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Error saving JSON file {output_json_file_path}: {e}")
            
    print("\nProcessing complete.")

if __name__ == "__main__":
    main()