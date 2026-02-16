import os, psycopg2, json, decimal
from dotenv import load_dotenv
load_dotenv()

DB_HOST = os.getenv('POSTGRES_HOST')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB')
DB_USER = os.getenv('POSTGRES_USER')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD')
DB_TABLE = os.getenv('POSTGRES_TABLE', 'products')

def get_db_connection():
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASSWORD)

def test_search(prompt):
    products_data = []
    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        search_query = f"%{prompt}%"
        query_sql = f"SELECT image_url, title, old_price, price, rating, who_by, product_url FROM {DB_TABLE} WHERE title ILIKE %s LIMIT 5"
        cur.execute(query_sql, (search_query,))
        rows = cur.fetchall()
        for row in rows:
            old_price = row[2]
            price = row[3]
            if isinstance(old_price, decimal.Decimal): old_price = float(old_price)
            if isinstance(price, decimal.Decimal): price = float(price)
            products_data.append({
                'title': row[1],
                'old_price': old_price,
                'price': price,
                'who_by': row[5]
            })
        cur.close()
        conn.close()
    return products_data

print("Testing search for 'Sony WH-1000XM5' (Expected Asaxiy):")
print(json.dumps(test_search('Sony WH-1000XM5'), indent=2))
print("\nTesting search for 'iPhone 15' (Expected Uzum):")
print(json.dumps(test_search('iPhone 15'), indent=2))
