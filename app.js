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
let regionWeatherData = {}; // 存储按区域聚合的天气数据
let hoveredProvinceId = null; // 悬停的省份ID
let chinaProvincesGeoData = null; // 存储中国省份边界数据
let stationProvinceCache = {}; // 缓存站点省份映射
let isProvincePreprocessed = false; // 标记是否已完成省份预处理
function renderChart(domId, option) {
    const dom = document.getElementById(domId);
    if (!dom) return;

    // 如果该 DOM 已经绑定过实例，先销毁
    let inst = echarts.getInstanceByDom(dom);
    if (inst) inst.dispose();

    inst = echarts.init(dom);
    inst.setOption(option);
    return inst;
}

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
        center: [104.1954, 35.8617],
        zoom: 4
    });

    map.on('load', function() {
        // 原始站点数据源 (点) - 融合两个版本的数据源
        map.addSource('weather-data-points', {
            'type': 'geojson',
            'data': { 'type': 'FeatureCollection', 'features': [] }
        });

        // 3D柱状图所需的多边形数据源
        map.addSource('weather-data-polygons', {
            'type': 'geojson',
            'data': { 'type': 'FeatureCollection', 'features': [] }
        });

        // 温度热力图层
        map.addLayer({
            'id': 'temperature-heatmap',
            'type': 'heatmap',
            'source': 'weather-data-points',
            'maxzoom': 9,
            'layout': { 'visibility': 'visible' },
            'paint': {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'value'], -20, 0, 40, 1],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 5],
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0,0,255,0)',
                    0.1, 'rgb(0,100,255)',
                    0.3, 'rgb(0,200,255)',
                    0.5, 'rgb(0,255,100)',
                    0.7, 'rgb(255,255,0)',
                    0.9, 'rgb(255,100,0)',
                    1, 'rgb(255,0,0)'
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 9, 40],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0]
            }
        });
        
        // 温度圆点图层 - 融合两个版本的样式
        map.addLayer({
            'id': 'temperature-points',
            'type': 'circle',
            'source': 'weather-data-points',
            'minzoom': 7,
            'layout': { 'visibility': 'visible' },
            'paint': {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 3,
                    16, 15
                ],
                'circle-color': [
                    'case',
                    ['==', ['get', 'type'], 'temperature'],
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'value'],
                        -30, '#020C64',   // 深蓝色（极冷）
                        -20, '#306AC7',  
                        -10, '#87AFE5',   // 冷
                        0, '#97E8AD',     // 冰点
                        10, '#F7B42D',    // 温和
                        20, '#EE6618',    // 温暖
                        25, '#E03F16',    
                        30, '#D0240E',    // 热
                        35, '#A90210',    
                        40, '#50000F'     // 极热
                    ],
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'value'],
                        0, '#A5F38D',     // 干燥
                        10, '#99D2CA',   
                        25, '#9BBCE8',    // 少雨
                        50, '#90caf9',    // 小雨
                        100, '#3B7EDB',   // 中雨
                        200, '#2B5CC2',   // 大雨
                        300, '#112C90',   // 暴雨
                        600, '#461981',   // 特大暴雨
                        800, '#86158A',
                        1000,'#C811A9',
                        2000,'#810040'    // 极端降水
                    ]
                ],
                'circle-opacity': 0.9,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });

        // 降水3D柱状图层
        map.addLayer({
            'id': 'precipitation-3d-bars',
            'type': 'fill-extrusion',
            'source': 'weather-data-polygons',
            'layout': { 'visibility': 'none' },
            'paint': {
                'fill-extrusion-height': ['interpolate', ['linear'], ['get', 'value'], 0, 0, 250, 500000 ],
                'fill-extrusion-base': 0,
                'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'value'], 10, '#87ceeb', 50, '#4169e1', 100, '#0000cd', 200, '#000080'],
                'fill-extrusion-opacity': 0.8
            }
        });

        setupMapInteractions();
        
        // 加载中国省份边界数据
        loadChinaProvinceData();
        
        loadWeatherData();
    });
}

// 设置地图交互 - 融合两个版本的交互功能
function setupMapInteractions() {
    const showSidePanel = (properties, coordinates) => {
        const stationName = properties.station || '未知站点';
        const lng = coordinates[0];
        const lat = coordinates[1];
        
        // 查找完整的站点数据
        const monthData = dataLoader.getDataForMonth(currentMonth);
        const station = monthData.find(s => s.name === stationName);
        
        if (station) {
            // 添加坐标信息
            station.lng = lng;
            station.lat = lat;
            station.provinceName = getProvinceByGeoData(lat, lng);
            
            // 统一调用showStationDetails
            showStationDetails(station);
        } else {
            // 如果找不到完整数据，显示基本信息
            document.getElementById('sidePanel').classList.add('active');
            document.getElementById('stationName').textContent = stationName;
            document.getElementById('stationCoord').textContent = `坐标: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            document.getElementById('stationValue').textContent = '暂无详细数据';
        }
    };

    // 温度点交互
    map.on('mouseenter', 'temperature-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'temperature-points', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'temperature-points', (e) => {
        showSidePanel(e.features[0].properties, e.features[0].geometry.coordinates);
    });

    // 3D柱状图交互 - 修复坐标获取问题
    map.on('mouseenter', 'precipitation-3d-bars', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'precipitation-3d-bars', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'precipitation-3d-bars', (e) => {
        // 使用center属性，如果不存在则尝试从几何中心计算
        let coordinates = e.features[0].properties.center;
        
        // 如果center不存在或格式不正确，尝试计算几何中心
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
            try {
                const centroid = turf.centroid(e.features[0]);
                coordinates = centroid.geometry.coordinates;
            } catch (error) {
                console.error('无法计算几何中心:', error);
                // 使用点击位置作为备选
                coordinates = [e.lngLat.lng, e.lngLat.lat];
            }
        }
        
        showSidePanel(e.features[0].properties, coordinates);
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
        );        // 获取可用月份并更新UI
        availableMonths = dataLoader.getAvailableMonths();
        
        if (availableMonths.length > 0) {
            currentMonth = availableMonths[0];
            currentYear = parseInt(currentMonth.split('-')[0]);
            
            availableYears = [...new Set(availableMonths.map(month => parseInt(month.split('-')[0])))];
            availableYears.sort((a, b) => a - b);
            
            updateMonthSelector();
            
            // 在省份边界数据加载完成后预处理省份信息
            if (chinaProvincesGeoData) {
                preprocessProvinceData();
            }
            
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

// 更新地图可视化 - 融合两个版本的可视化逻辑
function updateMapVisualization() {
    if (!map || !dataLoader || !currentMonth) return;
    
    const monthData = dataLoader.getDataForMonth(currentMonth);
    const pointsSource = map.getSource('weather-data-points');
    const polygonsSource = map.getSource('weather-data-polygons');

    if (!monthData || monthData.length === 0) {
        if(pointsSource) pointsSource.setData({ type: 'FeatureCollection', features: [] });
        if(polygonsSource) polygonsSource.setData({ type: 'FeatureCollection', features: [] });
        return;
    }

    const pointFeatures = monthData.map(station => {
        const value = currentDataType === 'temperature' ? station.temperature : station.precipitation;
        if (value === null || value === undefined) return null;
        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
            properties: { 
                value: value, 
                station: station.name, 
                type: currentDataType,
                temperature: station.temperature,
                precipitation: station.precipitation
            }
        };
    }).filter(feature => feature !== null);

    if(pointsSource) pointsSource.setData({ type: 'FeatureCollection', features: pointFeatures });

    // 3D柱状图处理
    if (currentDataType === 'precipitation') {
        if (typeof turf === 'undefined') {
            console.error("错误：Turf.js 库未加载！3D柱状图无法生成。");
            if(polygonsSource) polygonsSource.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        const polygonFeatures = pointFeatures.map(point => {
            const buffer = turf.buffer(point, 20, { units: 'kilometers' });
            buffer.properties = { ...point.properties, center: point.geometry.coordinates };
            return buffer;
        });
        if(polygonsSource) polygonsSource.setData({ type: 'FeatureCollection', features: polygonFeatures });
    } else {
        if(polygonsSource) polygonsSource.setData({ type: 'FeatureCollection', features: [] });
    }
    
    // 聚合数据并更新省份填充图层
    regionWeatherData = aggregateDataByRegion(monthData, currentDataType);
    updateProvinceFillLayer(regionWeatherData);
    
    // 更新当前显示的tooltip（如果有的话）
    if (window.updateCurrentTooltip) {
        window.updateCurrentTooltip();
    }
}

// 动画播放
function startAnimation() {
    if (isPlaying || availableMonths.length === 0) return;
    
    isPlaying = true;
    document.getElementById('playBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    
    let currentIndex = availableMonths.indexOf(currentMonth);
    if (currentIndex === -1) currentIndex = 0;
    
    animationInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % availableMonths.length;
        currentMonth = availableMonths[currentIndex];
        currentYear = parseInt(currentMonth.split('-')[0]);
        updateMapVisualization();
        updateUI();
    }, 1000);
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
        if (currentIndex > -1) monthSlider.value = currentIndex;
    }
    
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
    updateLegend();
    
    document.getElementById('playBtn').addEventListener('click', startAnimation);
    document.getElementById('pauseBtn').addEventListener('click', pauseAnimation);

    document.getElementById('monthSlider').addEventListener('input', function(e) {
        if (isPlaying) return;
        const monthIndex = parseInt(e.target.value);
        if (availableMonths[monthIndex]) {
            currentMonth = availableMonths[monthIndex];
            currentYear = parseInt(currentMonth.split('-')[0]);
            updateMapVisualization();
            updateUI();
        }
    });

    document.getElementById('yearSlider').addEventListener('input', function(e) {
        if (isPlaying) return;
        const selectedYear = parseInt(e.target.value);
        const firstMonthOfYear = availableMonths.find(month => month.startsWith(selectedYear.toString()));
        if (firstMonthOfYear) {
            currentMonth = firstMonthOfYear; 
            currentYear = selectedYear;
            updateMapVisualization();
            updateUI();
        }
    });

    document.getElementById('dataType').addEventListener('change', function(e) {
        currentDataType = e.target.value;
        updateLegend();
        
        if (currentDataType === 'temperature') {
            map.setLayoutProperty('temperature-heatmap', 'visibility', 'visible');
            map.setLayoutProperty('temperature-points', 'visibility', 'visible');
            map.setLayoutProperty('precipitation-3d-bars', 'visibility', 'none');

            // 平滑地将地图恢复到2D视角
            map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1000 
            });
        } else {
            map.setLayoutProperty('temperature-heatmap', 'visibility', 'none');
            map.setLayoutProperty('temperature-points', 'visibility', 'none');
            map.setLayoutProperty('precipitation-3d-bars', 'visibility', 'visible');

            // 平滑地将地图倾斜到3D视角
            map.easeTo({
                pitch: 45,
                bearing: -17.6,
                duration: 1000
            });
        }
        
        // 重新聚合数据并更新省份图层样式
        if (Object.keys(regionWeatherData).length > 0) {
            updateProvinceFillLayer(regionWeatherData);
        }
        
        // 更新当前显示的tooltip
        if (window.updateCurrentTooltip) {
            window.updateCurrentTooltip();
        }
        
        updateMapVisualization();
    });
    
    document.getElementById('closePanelBtn').addEventListener('click', () => {
        document.getElementById('sidePanel').classList.remove('active');
    });
}

// 当DOM加载完成时初始化应用
document.addEventListener('DOMContentLoaded', initApp);

// 聚合气象数据到行政区域
function aggregateDataByRegion(monthData, dataType) {
    const regionData = {};
    
    monthData.forEach(station => {
        const value = dataType === 'temperature' ? station.temperature : station.precipitation;
        if (value === null || value === undefined) return;
        
        const province = getProvinceByGeoData(station.lat, station.lng);
        
        if (!regionData[province]) {
            regionData[province] = {
                temperatures: [],
                precipitations: [],
                stations: [],
                coordinates: []
            };
        }
        
        regionData[province].temperatures.push(station.temperature);
        regionData[province].precipitations.push(station.precipitation);
        regionData[province].stations.push({
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            temperature: station.temperature,
            precipitation: station.precipitation
        });
        regionData[province].coordinates.push([station.lng, station.lat]);
    });
    
    // 计算每个省份的统计数据
    const aggregatedData = {};
    Object.keys(regionData).forEach(province => {
        const data = regionData[province];
        if (data.temperatures.length > 0) {
            const validTemps = data.temperatures.filter(t => t !== null && !isNaN(t));
            const validPrecips = data.precipitations.filter(p => p !== null && !isNaN(p));
            
            aggregatedData[province] = {
                avgTemperature: validTemps.length > 0 ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : null,
                maxTemperature: validTemps.length > 0 ? Math.max(...validTemps) : null,
                minTemperature: validTemps.length > 0 ? Math.min(...validTemps) : null,
                avgPrecipitation: validPrecips.length > 0 ? validPrecips.reduce((a, b) => a + b, 0) / validPrecips.length : null,
                maxPrecipitation: validPrecips.length > 0 ? Math.max(...validPrecips) : null,
                minPrecipitation: validPrecips.length > 0 ? Math.min(...validPrecips) : null,
                stationCount: data.stations.length,
                stations: data.stations,
                coordinates: data.coordinates
            };
        }
    });
    
    return aggregatedData;
}

// 省份名称映射：阿里云数据 -> 我们的数据
function mapAliyunToOurProvinceName(aliyunName) {
    const nameMapping = {
        '北京市': '北京',
        '上海市': '上海', 
        '天津市': '天津',
        '重庆市': '重庆',
        '黑龙江省': '黑龙江',
        '吉林省': '吉林',
        '辽宁省': '辽宁',
        '河北省': '河北',
        '河南省': '河南',
        '山东省': '山东',
        '山西省': '山西',
        '江苏省': '江苏',
        '浙江省': '浙江',
        '安徽省': '安徽',
        '福建省': '福建',
        '江西省': '江西',
        '湖北省': '湖北',
        '湖南省': '湖南',
        '广东省': '广东',
        '广西壮族自治区': '广西',
        '海南省': '海南',
        '四川省': '四川',
        '贵州省': '贵州',
        '云南省': '云南',
        '陕西省': '陕西',
        '甘肃省': '甘肃',
        '青海省': '青海',
        '内蒙古自治区': '内蒙古',
        '新疆维吾尔自治区': '新疆',
        '西藏自治区': '西藏',
        '宁夏回族自治区': '宁夏',
        '台湾省': '台湾',
        '香港特别行政区': '香港',
        '澳门特别行政区': '澳门'
    };
    
    return nameMapping[aliyunName] || aliyunName;
}

// 点在多边形内判断算法 (Ray Casting Algorithm)
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
}

// 检查点是否在多重多边形内（支持 MultiPolygon）
function pointInMultiPolygon(point, geometry) {
    if (geometry.type === 'Polygon') {
        // 检查外环
        const outerRing = geometry.coordinates[0];
        if (!pointInPolygon(point, outerRing)) {
            return false;
        }
        
        // 检查内环（孔洞）
        for (let i = 1; i < geometry.coordinates.length; i++) {
            const innerRing = geometry.coordinates[i];
            if (pointInPolygon(point, innerRing)) {
                return false; // 点在孔洞内
            }
        }
        
        return true;
    } else if (geometry.type === 'MultiPolygon') {
        // 对于 MultiPolygon，检查每个 Polygon
        for (const polygon of geometry.coordinates) {
            const outerRing = polygon[0];
            if (pointInPolygon(point, outerRing)) {
                // 检查这个多边形的内环
                let inHole = false;
                for (let i = 1; i < polygon.length; i++) {
                    const innerRing = polygon[i];
                    if (pointInPolygon(point, innerRing)) {
                        inHole = true;
                        break;
                    }
                }
                if (!inHole) {
                    return true;
                }
            }
        }
        return false;
    }
    
    return false;
}

// 基于阿里云边界数据的省份归属判断（带缓存优化）
function getProvinceByGeoData(lat, lng) {
    // 创建缓存键
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    
    // 优先使用缓存
    if (stationProvinceCache[cacheKey]) {
        return stationProvinceCache[cacheKey];
    }
    
    if (!chinaProvincesGeoData || !chinaProvincesGeoData.features) {
        return '未知';
    }
    
    const point = [lng, lat]; // GeoJSON 使用 [经度, 纬度] 格式
    
    // 遍历所有省份，检查点是否在其边界内
    for (const feature of chinaProvincesGeoData.features) {
        if (pointInMultiPolygon(point, feature.geometry)) {
            const provinceName = feature.properties.name;
            const mappedName = mapAliyunToOurProvinceName(provinceName);
            
            // 缓存结果
            stationProvinceCache[cacheKey] = mappedName;
            return mappedName;
        }
    }
    
    // 缓存未知结果
    stationProvinceCache[cacheKey] = '未知';
    return '未知';
}

// 加载中国省份边界数据
async function loadChinaProvinceData() {
    try {
        const response = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json');
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        
        const chinaGeoData = await response.json();
        chinaProvincesGeoData = chinaGeoData;
        
        // 添加省份数据源
        map.addSource('china-provinces', {
            type: 'geojson',
            data: chinaGeoData,
            generateId: true // 自动生成ID用于feature-state
        });
          // 添加【省份填充】图层
        map.addLayer({
            'id': 'province-fills',
            'type': 'fill',
            'source': 'china-provinces',
            'maxzoom': 7, // 在高缩放级别时隐藏省份填充，让气象站点更突出
            'paint': {                'fill-color': [
                    'case',
                    ['!=', ['get', 'weatherValue'], null],
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'weatherValue'],
                        -30, '#020C64',
                        -20, '#306AC7',
                        -10, '#87AFE5',
                        0, '#97E8AD',
                        10, '#F7B42D',
                        20, '#EE6618',
                        25, '#E03F16',
                        30, '#D0240E',
                        35, '#A90210',
                        40, '#50000F'
                    ],
                    'rgba(40, 42, 44, 0.35)'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.8,
                    [
                        'case',
                        ['!=', ['get', 'weatherValue'], null],
                        0.6,
                        0.1
                    ]
                ]
            }
        });
          // 添加省份边界图层
        map.addLayer({
            'id': 'province-borders',
            'type': 'line',
            'source': 'china-provinces',
            'paint': {
                'line-color': '#ffffff',
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    3, 0.5,
                    6, 1,
                    9, 1.5
                ],
                'line-opacity': 0.8
            }
        });
          // 设置省份交互
        setupProvinceInteractions();
        
        // 在省份边界数据加载完成后，如果天气数据也已加载完成，则触发预处理
        if (dataLoader && availableMonths.length > 0) {
            preprocessProvinceData();
        }
        
    } catch (error) {
        console.error('加载中国省份数据失败:', error);
    }
}

// 更新省份填充图层
function updateProvinceFillLayer(regionData) {
    const source = map.getSource('china-provinces');
    if (!source) return;
      // 获取当前GeoJSON数据
    const geoData = source._data;
    if (!geoData || !geoData.features) return;
    
    // 为每个省份设置天气数据
    geoData.features.forEach(feature => {
        const aliyunProvinceName = feature.properties.name;
        const mappedProvinceName = mapAliyunToOurProvinceName(aliyunProvinceName);
        const data = regionData[mappedProvinceName];
        
        if (data) {
            // 根据当前数据类型选择显示值
            const currentValue = currentDataType === 'temperature' ? data.avgTemperature : data.avgPrecipitation;
            feature.properties.weatherValue = currentValue;
            feature.properties.stationCount = data.stationCount;
            feature.properties.avgTemperature = data.avgTemperature;
            feature.properties.maxTemperature = data.maxTemperature;
            feature.properties.minTemperature = data.minTemperature;
            feature.properties.avgPrecipitation = data.avgPrecipitation;
            feature.properties.maxPrecipitation = data.maxPrecipitation;
            feature.properties.minPrecipitation = data.minPrecipitation;
            feature.properties.stations = JSON.stringify(data.stations);
        } else {
            feature.properties.weatherValue = null;
            feature.properties.stationCount = 0;
        }
    });
    
    // 更新数据源
    source.setData(geoData);

    // 更新图层的颜色映射 - 使用固定的颜色范围
    if (!map.getLayer('province-fills')) return;
    
    let colorExpression;    if (currentDataType === 'temperature') {
        // 温度色谱
        colorExpression = [
            'case',
            ['!=', ['get', 'weatherValue'], null],
            [
                'interpolate',
                ['linear'],
                ['get', 'weatherValue'],
                -30, '#020C64',   
                -20, '#306AC7',  
                -10, '#87AFE5',
                0, '#97E8AD',   
                10, '#F7B42D',   
                20, '#EE6618',   
                25, '#E03F16',    
                30, '#D0240E',     
                35, '#A90210',    
                40, '#50000F'    
            ],
            'rgba(200, 200, 200, 0.2)'  // 无数据时的灰色
        ];    } else {
        // 降水色谱
        colorExpression = [
            'case',
            ['!=', ['get', 'weatherValue'], null],
            [
                'interpolate',
                ['linear'],
                ['get', 'weatherValue'],
                0, '#A5F38D',    
                10, '#99D2CA',   
                25, '#9BBCE8',  
                50, '#90caf9',
                100, '#3B7EDB', 
                200, '#2B5CC2',
                300, '#112C90', 
                600, '#461981',
                800, '#86158A',
                1000,'#C811A9',
                2000,'#810040'
            ],
            'rgba(200, 200, 200, 0.2)'  // 无数据时的灰色
        ];
    }
    
    // 更新图层的颜色属性
    map.setPaintProperty('province-fills', 'fill-color', colorExpression);
}

// 设置省份交互
function setupProvinceInteractions() {
    // 创建tooltip popup
    const tooltip = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15
    });
    
    // 存储当前tooltip状态
    let currentTooltipProvinceId = null;
    
    // 鼠标悬停效果
    map.on('mouseenter', 'province-fills', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        
        if (e.features.length > 0) {
            const newProvinceId = e.features[0].id;
            
            // 如果鼠标移动到了不同的省份，强制更新
            if (currentTooltipProvinceId !== newProvinceId) {
                // 移除之前的悬停状态
                if (hoveredProvinceId !== null) {
                    map.setFeatureState(
                        { source: 'china-provinces', id: hoveredProvinceId },
                        { hover: false }
                    );
                }
                
                // 设置新的悬停状态
                hoveredProvinceId = newProvinceId;
                currentTooltipProvinceId = newProvinceId;
                
                map.setFeatureState(
                    { source: 'china-provinces', id: hoveredProvinceId },
                    { hover: true }
                );
                
                // 显示tooltip
                updateTooltipContent(e.features[0], e.lngLat, tooltip);
            }
        }
    });
    
    // 鼠标移动时更新tooltip位置和内容
    map.on('mousemove', 'province-fills', (e) => {
        if (e.features.length > 0) {
            const newProvinceId = e.features[0].id;
            
            // 如果移动到了不同的省份，更新tooltip
            if (currentTooltipProvinceId !== newProvinceId) {
                // 移除之前的悬停状态
                if (hoveredProvinceId !== null) {
                    map.setFeatureState(
                        { source: 'china-provinces', id: hoveredProvinceId },
                        { hover: false }
                    );
                }
                
                // 设置新的悬停状态
                hoveredProvinceId = newProvinceId;
                currentTooltipProvinceId = newProvinceId;
                
                map.setFeatureState(
                    { source: 'china-provinces', id: hoveredProvinceId },
                    { hover: true }
                );
                
                // 更新tooltip内容
                updateTooltipContent(e.features[0], e.lngLat, tooltip);
            } else {
                // 只更新tooltip位置
                tooltip.setLngLat(e.lngLat);
            }
        }
    });
    
    // 鼠标离开效果
    map.on('mouseleave', 'province-fills', () => {
        map.getCanvas().style.cursor = '';
        
        if (hoveredProvinceId !== null) {
            map.setFeatureState(
                { source: 'china-provinces', id: hoveredProvinceId },
                { hover: false }
            );
        }
        hoveredProvinceId = null;
        currentTooltipProvinceId = null;
        
        tooltip.remove();
    });
    
    // 点击省份显示详情
    map.on('click', 'province-fills', (e) => {
        const feature = e.features[0];
        showProvinceDetails(feature.properties);
    });
    
    // 存储tooltip引用以便在动画时更新
    window.currentTooltip = tooltip;
    window.updateCurrentTooltip = () => {
        if (currentTooltipProvinceId !== null && tooltip.isOpen()) {
            // 获取当前悬停的省份特征
            const features = map.queryRenderedFeatures(map.getCanvasContainer().querySelector('.mapboxgl-canvas'), {
                layers: ['province-fills']
            });
            
            const currentFeature = features.find(f => f.id === currentTooltipProvinceId);
            if (currentFeature) {
                // 更新tooltip内容但保持位置
                const currentLngLat = tooltip.getLngLat();
                updateTooltipContent(currentFeature, currentLngLat, tooltip);
            }
        }
    };
}

// 更新tooltip内容的辅助函数
function updateTooltipContent(feature, lngLat, tooltip) {
    const aliyunProvinceName = feature.properties.name;
    const mappedProvinceName = mapAliyunToOurProvinceName(aliyunProvinceName);
    const avgTemp = feature.properties.avgTemperature;
    const avgPrecip = feature.properties.avgPrecipitation;
    const stationCount = feature.properties.stationCount;
    
    let tooltipContent = `<div style="font-family: 'Microsoft YaHei', sans-serif;">
        <strong style="font-size: 14px; color: #333;">${aliyunProvinceName}</strong><br/>`;
    
    if (currentDataType === 'temperature') {
        if (avgTemp !== null && avgTemp !== undefined) {
            tooltipContent += `<span style="color: #ff5722;">🌡️ 平均温度: ${avgTemp.toFixed(1)}°C</span><br/>`;
        }
    } else {
        if (avgPrecip !== null && avgPrecip !== undefined) {
            tooltipContent += `<span style="color: #2196f3;">🌧️ 平均降水: ${avgPrecip.toFixed(1)}mm</span><br/>`;
        }
    }
    
    tooltipContent += `<span style="color: #666;">📍 气象站: ${stationCount}个</span><br/>`;
    tooltipContent += `<span style="color: #999; font-size: 12px; color: #888;">📅 ${currentMonth}</span><br/>`;
    tooltipContent += `<span style="color: #999; font-size: 12px;">点击查看详细信息</span>`;
    tooltipContent += '</div>';    tooltip.setLngLat(lngLat)
        .setHTML(tooltipContent)
        .addTo(map);
}

// 显示省份详细信息
function showProvinceDetails(provinceProps) {
    const aliyunProvinceName = provinceProps.name;
    const mappedProvinceName = mapAliyunToOurProvinceName(aliyunProvinceName);
    const avgTemp = provinceProps.avgTemperature;
    const maxTemp = provinceProps.maxTemperature;
    const minTemp = provinceProps.minTemperature;
    const avgPrecip = provinceProps.avgPrecipitation;
    const maxPrecip = provinceProps.maxPrecipitation;
    const minPrecip = provinceProps.minPrecipitation;    const stationCount = provinceProps.stationCount;
    const stations = provinceProps.stations ? JSON.parse(provinceProps.stations) : [];
    
    // 打开左侧面板
    const panel = document.getElementById('sidePanel');
    panel.classList.add('active');
    
    // 更新面板内容
    document.getElementById('stationName').textContent = `${aliyunProvinceName}概览`;
    document.getElementById('stationCoord').textContent = `气象站数量: ${stationCount}个站点`;
    document.getElementById('stationYear').textContent = `时间: ${currentMonth}`;
    
    // 创建省份详情HTML
    let detailsHTML = '<div class="province-details">';
    
    // 温度统计
    if (avgTemp !== null && avgTemp !== undefined) {
        detailsHTML += `
            <div class="stat-section">
                <h4>温度统计</h4>
                <p>平均温度: <strong>${avgTemp.toFixed(1)}°C</strong></p>
                <p>最高温度: <strong>${maxTemp.toFixed(1)}°C</strong></p>
                <p>最低温度: <strong>${minTemp.toFixed(1)}°C</strong></p>
            </div>
        `;
    }
    
    // 降水统计
    if (avgPrecip !== null && avgPrecip !== undefined) {
        detailsHTML += `
            <div class="stat-section">
                <h4>降水统计</h4>
                <p>平均降水: <strong>${avgPrecip.toFixed(1)}mm</strong></p>
                <p>最大降水: <strong>${maxPrecip.toFixed(1)}mm</strong></p>
                <p>最小降水: <strong>${minPrecip.toFixed(1)}mm</strong></p>
            </div>
        `;
    }
    
    // 气象站列表
    if (stations.length > 0) {
        detailsHTML += `
            <div class="stations-section">
                <h4>气象站列表</h4>
                <div class="stations-list">
        `;
        
        stations.forEach(station => {
            const temp = station.temperature !== null ? station.temperature.toFixed(1) + '°C' : 'N/A';
            const precip = station.precipitation !== null ? station.precipitation.toFixed(1) + 'mm' : 'N/A';
            
            detailsHTML += `
                <div class="station-item" onclick="flyToStation(${station.lng}, ${station.lat}, '${station.name}')">
                    <div class="station-name">${station.name}</div>
                    <div class="station-data">
                        <span>温度: ${temp}</span>
                        <span>降水: ${precip}</span>
                    </div>
                </div>
            `;
        });
        
        detailsHTML += '</div></div>';
    }
    
    detailsHTML += '</div>';
    
    // 更新显示值
    document.getElementById('stationValue').innerHTML = detailsHTML;
    
    // 清空图表区域，显示省份概览
    ['stationTempChart', 'stationRainChart'].forEach(id => {
        const dom = document.getElementById(id);
        if (!dom) return;
        const inst = echarts.getInstanceByDom(dom);
        if (inst) inst.dispose();   // 彻底释放
        dom.innerHTML = '';         // 再清空容器
    });

}

// 飞到指定气象站
function flyToStation(lng, lat, stationName) {
    // 飞到气象站位置
    map.flyTo({
        center: [lng, lat],
        zoom: 10,
        duration: 2000
    });
    
    // 查找气象站数据
    const monthData = dataLoader.getDataForMonth(currentMonth);
    const station = monthData.find(s => s.name === stationName);
    
    if (station) {        // 添加省份信息
        station.provinceName = getProvinceByGeoData(lat, lng);
        
        // 显示气象站详细信息
        setTimeout(() => {
            showStationDetails(station);
        }, 2000);
    }
}

// 显示气象站详细信息
function showStationDetails(station) {
    const stationName = station.name;
    const lng = station.lng;
    const lat = station.lat;
    const temperature = station.temperature;
    const precipitation = station.precipitation;
    
    // 打开侧边面板
    document.getElementById('sidePanel').classList.add('active');
    
    // 更新面板内容
    document.getElementById('stationName').innerHTML = `
        <span>${stationName}</span>
        <button onclick="returnToProvinceView('${station.provinceName || getProvinceByGeoData(lat, lng)}')" 
                style="margin-left: 10px; font-size: 12px; padding: 2px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
            返回省份
        </button>
    `;
    document.getElementById('stationCoord').textContent = `坐标: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    document.getElementById('stationValue').textContent =
        `${currentDataType === 'temperature' ? '温度' : '降水量'}: ${
            (currentDataType === 'temperature' ? temperature : precipitation) !== null ? 
            (currentDataType === 'temperature' ? temperature : precipitation).toFixed(2) : '无数据'
        } ${currentDataType === 'temperature' ? '°C' : 'mm'}`;
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

    // 渲染温度折线图
    renderChart('stationTempChart', {
        tooltip: { trigger: 'axis' },
        title: { text: '月平均温度 (°C)', left: 'center', top: 0 },
        xAxis: { type: 'category', data: monthLabels },
        yAxis: { type: 'value', name: '温度 (°C)' },
        series: [{
            name: '温度',
            type: 'line',
            smooth: true,
            data: tempSeries,
            itemStyle: { color: '#ff5733' }
        }]
    });

    // 渲染降水柱状图
    renderChart('stationRainChart', {
        tooltip: { trigger: 'axis' },
        title: { text: '月降雨量 (mm)', left: 'center', top: 0 },
        xAxis: { type: 'category', data: monthLabels },
        yAxis: { type: 'value', name: '降雨量 (mm)' },
        series: [{
            name: '降雨量',
            type: 'bar',
            data: precipSeries,
            itemStyle: { color: '#3398DB' }
        }]
    });
}

// 返回省份视图
function returnToProvinceView(provinceName) {
    // 缩放到中国全景
    map.flyTo({
        center: [104.1954, 35.8617],
        zoom: 4,
        duration: 1500
    });
    
    // 查找该省份的数据（provinceName应该是我们的映射名称）
    const provinceData = regionWeatherData[provinceName];
    if (provinceData) {
        // 模拟省份属性对象 - 这里需要使用阿里云的完整省份名称
        const reverseMapping = {
            '北京': '北京市',
            '上海': '上海市', 
            '天津': '天津市',
            '重庆': '重庆市',
            '黑龙江': '黑龙江省',
            '吉林': '吉林省',
            '辽宁': '辽宁省',
            '河北': '河北省',
            '河南': '河南省',
            '山东': '山东省',
            '山西': '山西省',
            '江苏': '江苏省',
            '浙江': '浙江省',
            '安徽': '安徽省',
            '福建': '福建省',
            '江西': '江西省',
            '湖北': '湖北省',
            '湖南': '湖南省',
            '广东': '广东省',
            '广西': '广西壮族自治区',
            '海南': '海南省',
            '四川': '四川省',
            '贵州': '贵州省',
            '云南': '云南省',
            '陕西': '陕西省',
            '甘肃': '甘肃省',
            '青海': '青海省',
            '内蒙古': '内蒙古自治区',
            '新疆': '新疆维吾尔自治区',
            '西藏': '西藏自治区',
            '宁夏': '宁夏回族自治区',
            '台湾': '台湾省',
            '香港': '香港特别行政区',
            '澳门': '澳门特别行政区'
        };
        
        const aliyunName = reverseMapping[provinceName] || provinceName;
        
        const provinceProps = {
            name: aliyunName,
            avgTemperature: provinceData.avgTemperature,
            maxTemperature: provinceData.maxTemperature,
            minTemperature: provinceData.minTemperature,
            avgPrecipitation: provinceData.avgPrecipitation,
            maxPrecipitation: provinceData.maxPrecipitation,
            minPrecipitation: provinceData.minPrecipitation,
            stationCount: provinceData.stationCount,
            stations: JSON.stringify(provinceData.stations)
        };
        
        // 延迟显示省份详情，等待地图动画完成
        setTimeout(() => {
            showProvinceDetails(provinceProps);
        }, 1000);
    }
}

// 更新图例
function updateLegend() {
    const legend = document.getElementById('legend');
    const legendTitle = document.getElementById('legendTitle');
    
    if (!legend || !legendTitle) return;
    
    if (currentDataType === 'temperature') {
        legendTitle.textContent = '温度图例';
        legend.innerHTML = `
            <h4>温度图例</h4>
            <div class="legend-item">
                <div class="legend-color" style="background: #020C64;"></div>
                <span>极冷 (-30°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #87AFE5;"></div>
                <span>冷 (-10°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #97E8AD;"></div>
                <span>冰点 (0°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #F7B42D;"></div>
                <span>温和 (10°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #EE6618;"></div>
                <span>温暖 (20°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #D0240E;"></div>
                <span>热 (30°C)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #50000F;"></div>
                <span>极热 (40°C)</span>
            </div>
        `;
    } else {
        legendTitle.textContent = '降水图例';
        legend.innerHTML = `
            <h4>降水图例</h4>
            <div class="legend-item">
                <div class="legend-color" style="background: #A5F38D;"></div>
                <span>干燥 (0mm)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #90caf9;"></div>
                <span>小雨 (50mm)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #3B7EDB;"></div>
                <span>中雨 (100mm)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #2B5CC2;"></div>
                <span>大雨 (200mm)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #112C90;"></div>
                <span>暴雨 (300mm)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #810040;"></div>
                <span>极端降水 (2000mm)</span>
            </div>
        `;
    }
}

// 预处理省份数据，为所有站点计算省份信息
function preprocessProvinceData() {
    if (!chinaProvincesGeoData || !dataLoader || isProvincePreprocessed) {
        return;
    }
    
    console.log('开始预处理省份数据...');
    const startTime = Date.now();
    
    // 收集所有唯一的站点位置
    const uniqueStations = new Map();
    const allMonths = dataLoader.getAvailableMonths();
    
    allMonths.forEach(month => {
        const monthData = dataLoader.getDataForMonth(month);
        monthData.forEach(station => {
            const key = `${station.lat.toFixed(6)},${station.lng.toFixed(6)}`;
            if (!uniqueStations.has(key)) {
                uniqueStations.set(key, {
                    lat: station.lat,
                    lng: station.lng,
                    name: station.name
                });
            }
        });
    });
    
    console.log(`发现 ${uniqueStations.size} 个唯一站点位置，开始计算省份归属...`);
    
    // 批量计算省份归属
    let processed = 0;
    uniqueStations.forEach((station, key) => {
        const province = getProvinceByGeoData(station.lat, station.lng);
        processed++;
        
        if (processed % 100 === 0) {
            const progress = (processed / uniqueStations.size * 100).toFixed(1);
            console.log(`省份归属计算进度: ${progress}% (${processed}/${uniqueStations.size})`);
        }
    });
    
    const endTime = Date.now();
    console.log(`省份数据预处理完成，用时 ${(endTime - startTime) / 1000} 秒`);
    console.log(`缓存了 ${Object.keys(stationProvinceCache).length} 个站点的省份信息`);
    
    isProvincePreprocessed = true;
    
    // 预处理完成后更新地图
    if (currentMonth) {
        updateMapVisualization();
    }
}