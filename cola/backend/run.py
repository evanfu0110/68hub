import sys
import os

# PyInstaller onefile mode: add the extracted folder to path
if getattr(sys, 'frozen', False):
    sys.path.insert(0, sys._MEIPASS)

from app.main import run

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        import traceback
        traceback.print_exc()
        input("按 Enter 键退出...")
        sys.exit(1)
