from products.models import Product

products = [
    {
        "name": "MacBook Pro M3",
        "description": "Eng so'nggi Apple noutbuki. M3 chip, 16GB RAM, 512GB SSD.",
        "price": 1999.00,
        "category": "Electronics",
        "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
    },
    {
        "name": "Sony WH-1000XM5",
        "description": "Shovqinni bekor qiluvchi quloqchinlar. Premium ovoz sifati.",
        "price": 349.99,
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
    },
    {
        "name": "Dell XPS 15",
        "description": "Kuzatuvchilar va dasturchilar uchun mukammal displey va kuchli performans.",
        "price": 1850.50,
        "category": "Electronics",
        "image_url": "https://images.unsplash.com/photo-1593642632823-8f78536788c6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
    },
    {
        "name": "Logitech MX Master 3S",
        "description": "Professional sichqoncha. Ergonomik dizayn va uzoq batareya quvvati.",
        "price": 99.00,
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
    }
]

for p in products:
    Product.objects.create(**p)
    print(f"Created {p['name']}")
