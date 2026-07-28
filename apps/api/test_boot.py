import sys
import traceback

with open("boot_log.txt", "w") as f:
    try:
        import app
        f.write("app imported successfully!\n")
    except Exception as e:
        f.write("Failed to import app:\n")
        traceback.print_exc(file=f)
