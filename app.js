// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoieG8yazQzNjciLCJhIjoiY21icHdsbnp3MDh2dTJrb2xnaW9pcWx5byJ9.l07aQWYQ-WDnMdGr4EKq1Q';

// 全局变量
let map;
let weatherData = {};
let currentMonth = '';
let currentYear = 2020; // 添加currentYear变量声明
let currentDataType = 'temperature';
let isPlaying = false;
let animationInterval;
let dataLoader;
let availableMonths = [];
let availableYears = []; // 添加availableYears变量声明

// 颜色映射函数
function getColor(value, type, min, max) {
    if (value === null || value === undefined || isNaN(value)) {
        return 'rgba(128, 128, 128, 0.1)'; // 灰色表示无数据
    }
    
    // 标准化值到0-1范围
    const normalized = (value - min) / (max - min);
    
    if (type === 'temperature') {
        // 温度：蓝色(冷) -> 绿色 -> 黄色 -> 红色(热)
        if (normalized < 0.33) {
            const ratio = normalized / 0.33;
            return `rgba(${Math.round(0 + ratio * 0)}, ${Math.round(100 + ratio * 155)}, ${Math.round(255 - ratio * 155)}, 0.7)`;
        } else if (normalized < 0.66) {
            const ratio = (normalized - 0.33) / 0.33;
            return `rgba(${Math.round(0 + ratio * 255)}, ${Math.round(255)}, ${Math.round(100 - ratio * 100)}, 0.7)`;
        } else {
            const ratio = (normalized - 0.66) / 0.34;
            return `rgba(${Math.round(255)}, ${Math.round(255 - ratio * 255)}, ${Math.round(0)}, 0.7)`;
        }
    } else {
        // 降水：白色 -> 浅蓝 -> 深蓝
        return `rgba(${Math.round(255 - normalized * 200)}, ${Math.round(255 - normalized * 100)}, 255, ${0.3 + normalized * 0.5})`;
    }
}

// 初始化地图
function initMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v10',
        center: [104.1954, 35.8617], // 中国中心
        zoom: 4
    });

    map.on('load', function() {
        // 添加天气数据源（初始为空）
        map.addSource('weather-data', {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': []
            }
        });

        // 添加热力图层
        map.addLayer({
            'id': 'weather-heatmap',
            'type': 'heatmap',
            'source': 'weather-data',
            'maxzoom': 9,
            'paint': {
                'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'value'],
                    0, 0,
                    100, 1
                ],
                'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 2,  // 从1改为2
                    9, 5   // 从3改为5
                ],
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0,0,255,0)',      // 透明蓝色
                    0.1, 'rgb(0,100,255)',     // 深蓝色
                    0.3, 'rgb(0,200,255)',     // 浅蓝色
                    0.5, 'rgb(0,255,100)',     // 绿色
                    0.7, 'rgb(255,255,0)',     // 黄色
                    0.9, 'rgb(255,100,0)',     // 橙色
                    1, 'rgb(255,0,0)'          // 红色
                ],
                'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 5,  // 从2改为5
                    9, 40  // 从20改为40
                ],
                'heatmap-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 1,
                    9, 0
                ]
            }
        });

        // 添加圆点图层（高缩放级别时显示）
        map.addLayer({
            'id': 'weather-points',
            'type': 'circle',
            'source': 'weather-data',
            'minzoom': 7,
            'paint': {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 3,   // 从1改为3
                    16, 15  // 从8改为15
                ],
                'circle-color': [
                    'case',
                    ['==', ['get', 'type'], 'temperature'],
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'value'],
                        -30, '#000080',  // 深蓝色（极冷）
                        -10, '#0000ff',  // 蓝色（冷）
                        0, '#00ffff',    // 青色（冰点）
                        10, '#00ff00',   // 绿色（凉爽）
                        20, '#ffff00',   // 黄色（温暖）
                        30, '#ff8000',   // 橙色（热）
                        40, '#ff0000'    // 红色（极热）
                    ],
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'value'],
                        0, '#f0f0f0',    // 浅灰色（无降水）
                        10, '#87ceeb',   // 浅蓝色（小雨）
                        25, '#4169e1',   // 中蓝色（中雨）
                        50, '#0000ff',   // 蓝色（大雨）
                        100, '#000080'   // 深蓝色（暴雨）
                    ]
                ],
                'circle-opacity': 0.9,  // 从0.8改为0.9，增加不透明度
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });

        setupMapInteractions();
        
        // 开始加载数据
        loadWeatherData();
    });
}

// 设置地图交互
function setupMapInteractions() {
    // 鼠标悬停效果
    map.on('mouseenter', 'weather-points', function() {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'weather-points', function() {
        map.getCanvas().style.cursor = '';
    });

    // 点击显示详情
    map.on('click', 'weather-points', function (e) {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;

        const stationName = properties.station || '未知站点';
        const lng = coordinates[0];
        const lat = coordinates[1];
        const value = properties.value;

        // 打开左侧面板
        const panel = document.getElementById('sidePanel');
        panel.classList.add('active');

        // 更新文本信息
        document.getElementById('stationName').textContent = stationName;
        document.getElementById('stationCoord').textContent = `坐标: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        document.getElementById('stationValue').textContent =
            `${currentDataType === 'temperature' ? '温度' : '降水量'}: ${value !== null ? value.toFixed(2) : '无数据'} ${currentDataType === 'temperature' ? '°C' : 'mm'}`;
        document.getElementById('stationYear').textContent = `年份: ${currentYear}`;

        // 生成全年数据
        const tempSeries = [], precipSeries = [];
        const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
        const monthLabels = months.map(m => `${parseInt(m)}月`);

        months.forEach(m => {
            const fullMonth = `${currentYear}-${m}`;
            const rec = dataLoader.getDataForMonth(fullMonth)?.find(d => d.name === stationName);
            tempSeries.push(rec?.temperature ?? null);
            precipSeries.push(rec?.precipitation ?? null);
        });

        // 渲染温度图（折线）
        const tempChart = echarts.init(document.getElementById('stationTempChart'));
        tempChart.setOption({
            tooltip: { trigger: 'axis' },
            title: { text: '月平均温度 (°C)', left: 'center', top: 0 },
            xAxis: {
                type: 'category',
                data: monthLabels
            },
            yAxis: {
                type: 'value',
                name: '温度 (°C)'
            },
            series: [{
                name: '温度',
                type: 'line',
                smooth: true,
                data: tempSeries,
                itemStyle: {
                    color: '#ff5733'
                }
            }]
        });

        // 渲染降水图（柱状）
        const rainChart = echarts.init(document.getElementById('stationRainChart'));
        rainChart.setOption({
            tooltip: { trigger: 'axis' },
            title: { text: '月降雨量 (mm)', left: 'center', top: 0 },
            xAxis: {
                type: 'category',
                data: monthLabels
            },
            yAxis: {
                type: 'value',
                name: '降雨量 (mm)'
            },
            series: [{
                name: '降雨量',
                type: 'bar',
                data: precipSeries,
                itemStyle: {
                    color: '#3398DB'
                }
            }]
        });
    });


}

// 加载天气数据
async function loadWeatherData() {
    try {
        dataLoader = new WeatherDataLoader();
        
        // 显示加载进度
        const loadingOverlay = document.getElementById('loadingOverlay');
        const progressFill = document.getElementById('progressFill');
        const loadingText = document.getElementById('loadingText');
        const errorMessage = document.getElementById('errorMessage');
        
        loadingOverlay.style.display = 'flex';
        
        // 加载预处理的JSON数据
        weatherData = await dataLoader.loadWeatherData(
            (progress, total, message, error) => {
                const progressPercent = (progress / total) * 100;
                progressFill.style.width = `${progressPercent}%`;
                
                if (error) {
                    loadingText.textContent = '数据加载失败';
                    errorMessage.textContent = `错误: ${error.message}`;
                    errorMessage.style.display = 'block';
                } else {
                    loadingText.textContent = message;
                }
            }
        );
        
        // 获取可用月份并更新UI
        availableMonths = dataLoader.getAvailableMonths();
        
        // In the loadWeatherData function, after getting availableMonths:
        if (availableMonths.length > 0) {
            currentMonth = availableMonths[0];
            // 从第一个可用月份中提取年份
            currentYear = parseInt(currentMonth.split('-')[0]);
            
            // 提取所有可用年份
            availableYears = [...new Set(availableMonths.map(month => parseInt(month.split('-')[0])))];
            availableYears.sort((a, b) => a - b); // 按年份排序
            
            // 更新月份选择器
            updateMonthSelector();
            
            // 显示数据统计
            const stats = dataLoader.getDataStats();
            console.log('数据统计:', stats);
            
            // 更新地图显示
            updateMapVisualization();
            updateUI();
            
            loadingText.textContent = '数据加载完成！';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 1000);
        } else {
            throw new Error('没有找到有效的天气数据');
        }
        
    } catch (error) {
        console.error('加载天气数据失败:', error);
        const errorMessage = document.getElementById('errorMessage');
        const loadingText = document.getElementById('loadingText');
        
        loadingText.textContent = '数据加载失败';
        errorMessage.textContent = `错误: ${error.message}`;
        errorMessage.style.display = 'block';
    }
}

// 更新月份选择器
function updateMonthSelector() {
    const monthSlider = document.getElementById('monthSlider');
    if (monthSlider) {
        monthSlider.min = 0;
        monthSlider.max = availableMonths.length - 1;
        monthSlider.value = 0;
    }
}

// 更新地图可视化
function updateMapVisualization() {
    if (!map || !dataLoader || !currentMonth) return;
    
    const monthData = dataLoader.getDataForMonth(currentMonth);
    
    if (monthData.length === 0) {
        console.log(`${currentMonth} 没有数据`);
        return;
    }
    
    // 创建GeoJSON特征
    const features = monthData.map(station => {
        const value = currentDataType === 'temperature' ? 
            station.temperature : station.precipitation;
            
        if (value === null || value === undefined) return null;
        
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [station.lng, station.lat]
            },
            properties: {
                value: value,
                station: station.name,
                temperature: station.temperature,
                precipitation: station.precipitation
            }
        };
    }).filter(feature => feature !== null);
    
    // 更新地图数据源
    map.getSource('weather-data').setData({
        type: 'FeatureCollection',
        features: features
    });
    
    console.log(`${currentMonth} 显示了 ${features.length} 个数据点`);
}

// 动画播放 - 统一使用月份控制
function startAnimation() {
    if (isPlaying || availableMonths.length === 0) return;
    
    isPlaying = true;
    document.getElementById('playBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    
    let currentIndex = availableMonths.indexOf(currentMonth);
    
    animationInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % availableMonths.length;
        currentMonth = availableMonths[currentIndex];
        
        // 更新当前年份
        currentYear = parseInt(currentMonth.split('-')[0]);
        
        updateMapVisualization();
        updateUI();
    }, 1000); // 每秒切换一个月
}

// 暂停动画
function pauseAnimation() {
    isPlaying = false;
    document.getElementById('playBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

// 更新UI显示
function updateUI() {
    const monthDisplay = document.getElementById('monthDisplay');
    if (monthDisplay) {
        monthDisplay.textContent = currentMonth;
    }
    
    const monthSlider = document.getElementById('monthSlider');
    if (monthSlider) {
        const currentIndex = availableMonths.indexOf(currentMonth);
        monthSlider.value = currentIndex;
    }
    
    // 同时更新年份显示
    const yearDisplay = document.getElementById('yearDisplay');
    if (yearDisplay) {
        yearDisplay.textContent = currentYear;
    }
    
    const yearSlider = document.getElementById('yearSlider');
    if (yearSlider) {
        yearSlider.value = currentYear;
    }
}

// 初始化应用
function initApp() {
    initMap();
    
    // 设置事件监听器
    document.getElementById('playBtn').addEventListener('click', startAnimation);
    document.getElementById('pauseBtn').addEventListener('click', pauseAnimation);
    
    // 月份滑块事件
    document.getElementById('monthSlider').addEventListener('input', function(e) {
        if (!isPlaying) {
            const monthIndex = parseInt(e.target.value);
            currentMonth = availableMonths[monthIndex];
            currentYear = parseInt(currentMonth.split('-')[0]);
            updateMapVisualization();
            updateUI();
        }
    });
    
    // 年份滑块事件 - 选择该年份的第一个月
    document.getElementById('yearSlider').addEventListener('input', function(e) {
        if (!isPlaying) {
            const selectedYear = parseInt(e.target.value);
            const yearMonths = availableMonths.filter(month => month.startsWith(selectedYear.toString()));
            if (yearMonths.length > 0) {
                currentMonth = yearMonths[0];
                currentYear = selectedYear;
                updateMapVisualization();
                updateUI();
            }
        }
    });
    
    document.getElementById('dataType').addEventListener('change', function(e) {
        currentDataType = e.target.value;
        updateMapVisualization();
    });
    document.getElementById('closePanelBtn').addEventListener('click', () => {
    document.getElementById('sidePanel').classList.remove('active');
});

}

// 当DOM加载完成时初始化应用
document.addEventListener('DOMContentLoaded', initApp);