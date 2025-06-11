import requests
import bs4
import os
from urllib.parse import urljoin, urlparse
import time
import multiprocessing # 导入 multiprocessing 模块

BASE_URL = "https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/"
DOWNLOAD_DIR = "noaa_gsod_data" # 下载文件将存储在此文件夹

def get_links_from_url(url, content_type_check=None):
    """
    从给定的URL获取链接。
    content_type_check: 一个函数，用于检查链接是否是我们想要的类型 (例如，是目录还是特定文件类型)。
    """
    links = []
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()  # 如果请求失败则引发HTTPError
        soup = bs4.BeautifulSoup(response.content, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            # 忽略父目录链接、查询参数或页面内锚点
            if href == "../" or href.startswith("?") or href.startswith("#") or not href:
                continue
            if content_type_check is None or content_type_check(href):
                links.append(href)
    except requests.exceptions.RequestException as e:
        # 在多进程环境中，考虑使用更集中的日志记录方式，但对于此脚本，打印到控制台可能足够
        print(f"获取链接时出错 {url}: {e}")
    return links

def is_year_directory(href):
    """检查链接是否为年份目录 (例如 '1929/')"""
    return href.endswith('/') and href[:-1].isdigit()

def is_csv_file(href):
    """检查链接是否为.csv文件"""
    return href.lower().endswith('.csv')

def download_file(file_url, local_path):
    """下载文件并保存到本地路径 (此函数将被多进程调用)"""
    try:
        # 确保目标目录存在
        # os.makedirs 在多进程中与 exist_ok=True 一起使用是安全的
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        if os.path.exists(local_path):
            print(f"文件已存在，跳过: {local_path} (进程: {os.getpid()})")
            return

        print(f"准备下载: {file_url} (进程: {os.getpid()})")
        #response = requests.get(file_url, stream=True, timeout=60)
        session = requests.Session()
        response = session.get(file_url, stream=True, timeout=60)
        response.raise_for_status()
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"成功下载到: {local_path} (进程: {os.getpid()})")
        #time.sleep(0.2) # 稍微减少延时，因为现在是并行下载，但仍保留以示友好
    except requests.exceptions.RequestException as e:
        print(f"下载文件时出错 {file_url}: {e} (进程: {os.getpid()})")
    except IOError as e:
        print(f"保存文件时出错 {local_path}: {e} (进程: {os.getpid()})")
    except Exception as e:
        print(f"下载/保存 {file_url} 时发生未知错误: {e} (进程: {os.getpid()})")


def main():
    """主执行函数"""
    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)
        print(f"创建下载目录: {DOWNLOAD_DIR}")

    print(f"开始从 {BASE_URL} 获取年份目录...")
    year_directories = get_links_from_url(BASE_URL, is_year_directory)

    if not year_directories:
        print("未找到年份目录。")
        return

    print(f"找到年份目录: {len(year_directories)}")

    all_download_tasks = [] # 用于存储所有下载任务 (file_url, local_path)

    for year_dir_name in year_directories:
        year_url = urljoin(BASE_URL, year_dir_name)
        year_str = year_dir_name.strip('/')
        print(f"\n正在收集年份 {year_str} 的文件列表 (URL: {year_url})")

        csv_files = get_links_from_url(year_url, is_csv_file)

        if not csv_files:
            print(f"年份 {year_str} 未找到 .csv 文件。")
            continue

        print(f"在年份 {year_str} 中找到 {len(csv_files)} 个 .csv 文件。")

        for csv_file_name in csv_files:
            file_download_url = urljoin(year_url, csv_file_name)
            actual_file_name = os.path.basename(urlparse(csv_file_name).path)
            local_file_path = os.path.join(DOWNLOAD_DIR, year_str, actual_file_name)
            all_download_tasks.append((file_download_url, local_file_path))

    if not all_download_tasks:
        print("未找到任何需要下载的文件。")
        return

    print(f"\n总共收集到 {len(all_download_tasks)} 个文件准备下载。")

    # 设置进程数，可以根据CPU核心数调整，但也要考虑服务器的承受能力
    # os.cpu_count() 通常是一个不错的起点，但如果文件非常多或服务器有限制，可能需要减少
    num_processes = os.cpu_count() * 2 
    # 您可以根据实际情况调整这个数字，例如 num_processes = 4 或 10
    print(f"将使用 {num_processes} 个进程进行下载...")

    # 使用进程池执行下载任务
    # starmap 会将 all_download_tasks 中的每个元组解包作为参数传递给 download_file
    with multiprocessing.Pool(processes=num_processes) as pool:
        pool.starmap(download_file, all_download_tasks)

    print("\n所有文件下载尝试完成。")

if __name__ == "__main__":
    # 在Windows上使用 multiprocessing 时，建议添加此行，特别是当脚本可能被冻结成可执行文件时
    multiprocessing.freeze_support()
    main()