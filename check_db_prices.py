import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv('POSTGRES_HOST')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB')
DB_USER = os.getenv('POSTGRES_USER')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD')
DB_TABLE = os.getenv('POSTGRES_TABLE', 'products')

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

try:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(f"SELECT title, old_price, price FROM {DB_TABLE} LIMIT 10")
    rows = cur.fetchall()
    print("Sample data from DB:")
    for row in rows:
        print(f"Title: {row[0]}, Old Price: {row[1]}, Price: {row[2]}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
