from products.models import Product

products_data = []
for i in range(1, 41):
    category = "Electronics" if i % 2 == 0 else "Accessories"
    products_data.append({
        "name": f"Mahsulot {i}",
        "description": f"Bu {i}-Market",
        "price": 100.00 + (i * 5),
        "category": category
    })

# Clear existing products
Product.objects.all().delete()

for p in products_data:
    Product.objects.create(**p)

print(f"Successfully seeded {Product.objects.count()} products.")
