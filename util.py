import os
import yaml

ROOT_DIR = os.path.dirname(os.path.realpath(__file__))
CONFIG_FILE = os.path.join(ROOT_DIR, 'config.yaml')

def load_config():
    with open(CONFIG_FILE) as f:
        return yaml.safe_load(f)
