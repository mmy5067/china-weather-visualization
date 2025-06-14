# GSOD 数据源处理指南

## 数据源介绍

### GSOD (Global Summary of the Day) 数据集
- **数据来源**: NOAA (美国国家海洋和大气管理局)
- **数据类型**: 全球气象站每日天气摘要数据
- **覆盖范围**: 全球气象站，本项目聚焦中国地区约1000个气象站
- **时间跨度**: 1942-2024年
- **数据规模**: 约1.82GB，包含1000个CSV文件
- **数据格式**: 原始数据采用英制单位
- **缺失值约定**: 不同字段使用不同缺失值标识 (温度: 9999.9, 风速/能见度: 999.9, 降水: 99.99)

### 数据字段说明

**注意**: GSOD原始数据使用英制单位，处理后转换为公制单位。各字段有不同的缺失值标识。

| 字段 | 说明 | 原始单位 | 处理后单位 | 缺失值标识 |
|------|------|----------|-----------|------------|
| STATION | 气象站编号 (WMO/DATSAV3，可能与WBAN编号组合) | - | - | - |
| DATE | 日期 | mm/dd/yyyy | YYYY-MM-DD | - |
| LATITUDE | 纬度 (十进制度，南半球为负值) | 度 | 度 | - |
| LONGITUDE | 经度 (十进制度，西半球为负值) | 度 | 度 | - |
| ELEVATION | 海拔高度 | 米 | 米 | - |
| NAME | 气象站/机场/军事基地名称 | - | - | - |
| TEMP | 日平均气温 | °F (精确到十分位) | °C | 9999.9 |
| DEWP | 日平均露点温度 | °F (精确到十分位) | °C | 9999.9 |
| SLP | 日平均海平面气压 | 毫巴 (精确到十分位) | hPa | 9999.9 |
| STP | 日平均站点气压 | 毫巴 (精确到十分位) | hPa | 9999.9 |
| VISIB | 日平均能见度 | 英里 (精确到十分位) | km | 999.9 |
| WDSP | 日平均风速 | 节 (精确到十分位) | m/s | 999.9 |
| MXSPD | 日最大持续风速 | 节 (精确到十分位) | m/s | 999.9 |
| GUST | 日最大阵风速度 | 节 (精确到十分位) | m/s | 999.9 |
| MAX | 日最高气温 | °F (精确到十分位) | °C | 9999.9 |
| MIN | 日最低气温 | °F (精确到十分位) | °C | 9999.9 |
| PRCP | 日总降水量 (雨和/或融雪) | 英寸 (精确到百分位) | mm | 99.99 |
| SNDP | 雪深 (当日最后报告值) | 英寸 (精确到十分位) | cm | 999.9 |
| FRSHTT | 天气现象标志 (6位二进制：雾/雨/雪/雹/雷/龙卷风) | 二进制 | 二进制 | - |
| HMD | 相对湿度 (由温度和露点计算得出) | - | % | - |

**注释**:
- **TEMP_ATTRIBUTES**, **DEWP_ATTRIBUTES** 等: 记录计算平均值时使用的观测次数
- **MAX_ATTRIBUTES**, **MIN_ATTRIBUTES**: 标记最值数据来源（显式报告 vs 小时数据推导）
- **PRCP_ATTRIBUTES**: 降水数据来源标识 (A-I，表示不同时间段的累积方式)
- **FRSHTT**: F(雾)-R(雨)-S(雪)-H(雹)-T(雷)-T(龙卷风)，1=发生，0=未发生/未报告
- 本项目处理时已移除 MXSPD, GUST 及所有 *_ATTRIBUTES 字段

## 数据预处理流程

### 0. 数据下载 (`pull.py` / `pull2.py`)
**目标**: 从NOAA官方网站下载全球GSOD数据集

**数据源**:
- **URL**: https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/
- **数据规模**: 37.5GB (全球数据，1942-2025年)
- **文件格式**: 按年份组织的CSV文件
- **覆盖范围**: 全球所有气象站数据

**下载策略**:
- **pull.py**: 多进程并行下载版本
  - 使用多进程池 (`multiprocessing.Pool`)
  - 进程数 = CPU核心数 × 2
- **pull2.py**: 单进程顺序下载版本
  - 逐文件下载
  - 本项目中主要用于多进程下载完成后查缺补漏，检查是否完全下载

**下载流程**:
1. 解析NOAA网站目录结构，获取年份列表
2. 遍历每个年份目录，获取CSV文件列表
3. 批量下载所有CSV文件到 `noaa_gsod_data/年份/` 目录
4. 自动跳过已存在的文件

### 1. 数据质量检查 (`checkrange.py`)
**目标**: 识别和清理有问题的气象站数据

**检查内容**:
- 超出中国地理范围的坐标 (纬度: 3-54° && 经度: 73-136° && 站点名中含",CN"的中国标签)
- 无效坐标 (0, 0)
- BOGUS 标记的无效站点
- 缺失的关键字段

**数据筛选**:
- 从全球数据中筛选出中国范围内的约1000个气象站
- 将全球数据集减少到约1.82GB的中国本土数据
- 为后续处理提供质量可靠的基础数据
- 若目标为中国站点（"CN"）但坐标为(0,0)或缺失，预先导出站点名，人工核对查找坐标，硬编码到代码中做坐标替换

### 2. 数据格式转换和清理 (`process.py`)
**目标**: 处理原始CSV文件，进行单位转换和数据标准化

**主要功能**:
- **单位转换**: 英制单位转换为公制单位
  - 温度: 华氏度 → 摄氏度
  - 降水量/雪深: 英寸 → 毫米/厘米
  - 能见度: 英里 → 千米
  - 风速: 节 → 米/秒
- **数据计算**: 根据温度和露点计算相对湿度
- **数据清理**: 移除无效列，处理缺失值标识
- **格式统一**: 生成标准化的CSV和JSON文件

**输出格式**:
- 按气象站分类的CSV文件
- 对应的JSON格式文件（便于前端加载）

### 3. 坐标修正 (`updateloss.py`)
**目标**: 修复缺失或错误的经纬度坐标

**处理逻辑**:
- 检测坐标为 (0, 0) 的记录
- 根据站点名称和历史数据推断正确坐标
- 同时更新CSV和JSON文件中的坐标信息
- 保持数据一致性


## 数据处理工具

### 主要脚本功能
- `pull.py`: **全球数据下载** (多进程版本) - 从NOAA下载20GB+全球GSOD数据
- `pull2.py`: **全球数据下载** (单进程版本) - 稳定性优先的下载方案
- `checkrange.py`: **地理筛选** - 从全球数据中筛选中国范围气象站，数据质量检查和清理
- `updateloss.py`: **坐标修正** - 更新缺失的经纬度信息
- `process.py`: **数据标准化** - CSV数据处理，单位转换和格式标准化

## 输出格式

### 最终数据结构
- **格式**: 站点分类csv
- **时间范围**: 支持1942-2024年时间轴
- **数据类型**: 温度、降水量、天气现象等


