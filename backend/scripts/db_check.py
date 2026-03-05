import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db

app = create_app()

with app.app_context():
    inspector = db.inspect(db.engine)
    print("Tables found:", inspector.get_table_names())
