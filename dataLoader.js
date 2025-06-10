class WeatherDataLoader {
    constructor() {
        this.weatherData = {};
        this.metadata = {};
        this.loadingProgress = 0;
    }

    // 加载预处理的JSON数据
    async loadWeatherData(onProgress) {
        try {
            if (onProgress) {
                onProgress(0, 1, '开始加载数据...', null);
            }

            const response = await fetch('./weather_data.json');
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }

            if (onProgress) {
                onProgress(0.5, 1, '正在解析数据...', null);
            }

            const jsonData = await response.json();
            
            this.metadata = jsonData.metadata;
            this.weatherData = jsonData.data;

            if (onProgress) {
                onProgress(1, 1, '数据加载完成', null);
            }

            console.log('数据加载完成:', this.metadata);
            return this.weatherData;

        } catch (error) {
            console.error('加载天气数据失败:', error);
            if (onProgress) {
                onProgress(0, 1, '数据加载失败', error);
            }
            throw error;
        }
    }

    // 获取指定年月的数据
    getDataForMonth(yearMonth) {
        return this.weatherData[yearMonth] || [];
    }

    // 获取所有可用的年月
    getAvailableMonths() {
        return Object.keys(this.weatherData).sort();
    }

    // 获取可用的年份
    getAvailableYears() {
        const months = this.getAvailableMonths();
        const years = [...new Set(months.map(month => parseInt(month.substring(0, 4))))];
        return years.sort((a, b) => a - b);
    }

    // 获取指定年份的所有月份数据
    getDataForYear(year) {
        const yearStr = year.toString();
        const yearData = [];
        
        Object.keys(this.weatherData).forEach(month => {
            if (month.startsWith(yearStr)) {
                yearData.push(...this.weatherData[month]);
            }
        });
        
        return yearData;
    }

    // 获取数据统计信息
    getDataStats() {
        if (!this.metadata || Object.keys(this.weatherData).length === 0) {
            return null;
        }

        const months = this.getAvailableMonths();
        const years = this.getAvailableYears();
        
        let tempRange = { min: Infinity, max: -Infinity };
        let precipRange = { min: Infinity, max: -Infinity };
        
        // 计算温度和降水范围
        Object.values(this.weatherData).forEach(monthData => {
            monthData.forEach(record => {
                if (record.temperature !== null && !isNaN(record.temperature)) {
                    tempRange.min = Math.min(tempRange.min, record.temperature);
                    tempRange.max = Math.max(tempRange.max, record.temperature);
                }
                if (record.precipitation !== null && !isNaN(record.precipitation)) {
                    precipRange.min = Math.min(precipRange.min, record.precipitation);
                    precipRange.max = Math.max(precipRange.max, record.precipitation);
                }
            });
        });
        
        return {
            totalRecords: this.metadata.total_records,
            totalMonths: months.length,
            monthRange: { 
                start: months[0], 
                end: months[months.length - 1] 
            },
            yearRange: { 
                min: Math.min(...years), 
                max: Math.max(...years) 
            },
            temperatureRange: tempRange.min === Infinity ? null : tempRange,
            precipitationRange: precipRange.min === Infinity ? null : precipRange
        };
    }
}

// 导出数据加载器
window.WeatherDataLoader = WeatherDataLoader;