import logging
import psutil

logger = logging.getLogger("lumina.telemetry")

# Initialize NVML safely
nvml_initialized = False
try:
    import pynvml
    pynvml.nvmlInit()
    nvml_initialized = True
    logger.info("NVML initialized successfully.")
except Exception as e:
    logger.warning(f"NVML could not be initialized (GPU metrics may be simulated or unavailable): {e}")

# Primer call for cpu_percent so next calls return non-blocking delta
psutil.cpu_percent(interval=None)


def get_system_stats() -> dict:
    # 1. CPU
    cpu_usage = psutil.cpu_percent(interval=None)

    # 2. RAM
    vm = psutil.virtual_memory()
    ram_total_gb = round(vm.total / (1024 ** 3), 1)
    ram_used_gb = round(vm.used / (1024 ** 3), 1)
    ram_percent = round(vm.percent, 1)

    # 3. GPUs
    gpus = []
    global nvml_initialized
    if not nvml_initialized:
        try:
            pynvml.nvmlInit()
            nvml_initialized = True
        except Exception:
            pass

    if nvml_initialized:
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            for i in range(device_count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                raw_name = pynvml.nvmlDeviceGetName(handle)
                gpu_name = raw_name.decode("utf-8") if isinstance(raw_name, bytes) else str(raw_name)

                # Utilization
                try:
                    rates = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    core_util = int(rates.gpu)
                except Exception:
                    core_util = 0

                # Memory
                try:
                    mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    vram_used_mb = int(mem.used / (1024 ** 2))
                    vram_total_mb = int(mem.total / (1024 ** 2))
                except Exception:
                    vram_used_mb = 0
                    vram_total_mb = 0

                # Temperature
                try:
                    temp_c = int(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
                except Exception:
                    temp_c = 0

                # Power
                try:
                    power_w = round(pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0, 1)
                except Exception:
                    power_w = 0.0

                gpus.append({
                    "id": i,
                    "name": gpu_name,
                    "core_util_percent": core_util,
                    "vram_used_mb": vram_used_mb,
                    "vram_total_mb": vram_total_mb,
                    "temp_c": temp_c,
                    "power_w": power_w
                })
        except Exception as e:
            logger.error(f"Error querying GPU metrics: {e}")

    return {
        "cpu": {
            "usage_percent": round(cpu_usage, 1)
        },
        "ram": {
            "total_gb": ram_total_gb,
            "used_gb": ram_used_gb,
            "usage_percent": ram_percent
        },
        "gpus": gpus
    }
