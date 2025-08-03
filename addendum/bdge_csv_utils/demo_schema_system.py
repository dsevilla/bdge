#!/usr/bin/env python3
"""
Demonstration script showing the main features of the schema system.
This script demonstrates:
1. Creating schemas programmatically
2. Converting schemas to/from dataclasses
3. Generating SQL from schemas
4. Schema manipulation operations
"""

from dataclasses import dataclass
from datetime import datetime, date
from typing import Annotated, List

from bdge_csv_utils.schema.types import Schema, Field, PrimaryKey, Reference
from bdge_csv_utils.schema.dataclass_conversion import (
    schema_to_dataclass,
    dataclass_to_schema,
    instance_to_schema
)
from bdge_csv_utils.schema.ops import (
    print_schema,
    add_field,
    remove_field,
    rename_field,
    merge_schemas,
    validate_schema,
    schema_to_sql,
    schema_to_sql_insert,
    schema_to_sql_select
)


def demo_basic_schema_creation():
    """Demonstrate creating schemas from scratch."""
    print("🔧 Basic Schema Creation")
    print("=" * 50)
    
    # Create a user schema with various field types
    user_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("username", str),
        Field("email", str | None),
        Field("full_name", str),
        Field("birth_date", date | None),
        Field("is_active", bool),
        Field("created_at", datetime),
        Field("tags", List[str])
    ])
    
    print("Created user schema:")
    print_schema(user_schema)
    
    print(f"\nSchema has {len(user_schema.fields)} fields")
    print(f"Field names: {user_schema.field_names()}")
    print(f"Has 'email' field: {user_schema.has_field('email')}")
    print(f"Has 'password' field: {user_schema.has_field('password')}")
    
    return user_schema


def demo_dataclass_conversion(schema: Schema):
    """Demonstrate converting schemas to/from dataclasses."""
    print("\n🔄 Dataclass Conversion")
    print("=" * 50)
    
    # Convert schema to dataclass
    UserClass = schema_to_dataclass(schema, "User")
    print(f"Generated dataclass: {UserClass.__name__}")
    
    # Create an instance
    user = UserClass(
        id=1,
        username="alice_wonderland",
        full_name="Alice Wonderland",
        birth_date=date(1990, 3, 15),
        is_active=True,
        created_at=datetime.now(),
        tags=["developer", "python", "databases"],
        email="alice@example.com"
    )
    
    print(f"Created user instance: {user}")
    
    # Convert dataclass back to schema
    converted_schema = dataclass_to_schema(UserClass)
    print(f"\nConverted back to schema with {len(converted_schema.fields)} fields")
    
    # Create schema from instance (type inference)
    inferred_schema = instance_to_schema(user)
    print(f"Inferred schema from instance has {len(inferred_schema.fields)} fields")
    
    return UserClass, user


def demo_existing_dataclass_to_schema():
    """Demonstrate converting existing dataclasses to schemas."""
    print("\n📋 Existing Dataclass to Schema")
    print("=" * 50)
    
    @dataclass
    class Product:
        id: int
        name: str
        description: str | None = None
        price: float = 0.0
        category: str = "general"
        in_stock: bool = True
        created_at: datetime | None = None
    
    # Convert existing dataclass to schema
    product_schema = dataclass_to_schema(Product)
    
    print("Original dataclass:")
    print(f"  {Product}")
    
    print("\nConverted schema:")
    print_schema(product_schema)
    
    # Create instance and convert back
    product = Product(
        id=101,
        name="Magic Widget",
        description="A wonderful widget that does magical things",
        price=29.99,
        category="widgets",
        created_at=datetime.now()
    )
    
    instance_schema = instance_to_schema(product)
    print(f"\nSchema from instance has {len(instance_schema.fields)} fields")
    
    return product_schema


def demo_sql_generation(schema: Schema):
    """Demonstrate SQL generation from schemas."""
    print("\n🗄️  SQL Generation")
    print("=" * 50)
    
    table_name = "users"
    
    # Generate CREATE TABLE statement
    create_sql = schema_to_sql(schema, table_name)
    print("CREATE TABLE statement:")
    print(create_sql)
    
    # Generate INSERT statement template
    insert_sql = schema_to_sql_insert(schema, table_name)
    print(f"\nINSERT statement template:")
    print(insert_sql)
    
    # Generate SELECT statement
    select_sql = schema_to_sql_select(schema, table_name)
    print(f"\nSELECT statement:")
    print(select_sql)


def demo_schema_operations(schema: Schema):
    """Demonstrate schema manipulation operations."""
    print("\n🛠️  Schema Operations")
    print("=" * 50)
    
    print("Original schema fields:", schema.field_names())
    
    # Add a field
    extended_schema = add_field(schema, Field("last_login", datetime | None))
    print("After adding 'last_login':", extended_schema.field_names())
    
    # Remove a field
    reduced_schema = remove_field(extended_schema, "tags")
    print("After removing 'tags':", reduced_schema.field_names())
    
    # Rename a field
    renamed_schema = rename_field(reduced_schema, "full_name", "display_name")
    print("After renaming 'full_name' to 'display_name':", renamed_schema.field_names())
    
    # Validate schema
    errors = validate_schema(renamed_schema)
    print(f"Schema validation: {'✓ Valid' if not errors else f'✗ Errors: {errors}'}")
    
    return renamed_schema


def demo_schema_merging():
    """Demonstrate merging schemas."""
    print("\n🔗 Schema Merging")
    print("=" * 50)
    
    # Create base user schema
    base_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("username", str),
        Field("email", str)
    ])
    
    # Create profile extension
    profile_schema = Schema([
        Field("email", str | None),  # Override to make optional
        Field("first_name", str),
        Field("last_name", str),
        Field("bio", str | None)
    ])
    
    # Create preferences schema
    preferences_schema = Schema([
        Field("theme", str),
        Field("language", str),
        Field("notifications", bool)
    ])
    
    print("Base schema:", base_schema.field_names())
    print("Profile schema:", profile_schema.field_names())
    print("Preferences schema:", preferences_schema.field_names())
    
    # Merge schemas
    extended = merge_schemas(base_schema, profile_schema)
    full_schema = merge_schemas(extended, preferences_schema)
    
    print("Merged schema:", full_schema.field_names())
    print(f"Total fields: {len(full_schema.fields)}")
    
    # Check that email was overridden to be optional
    email_field = full_schema.get_field("email")
    if email_field:
        print(f"Email field type: {email_field.field_type}")
    else:
        print("Email field not found")
    
    return full_schema


def demo_nested_schemas():
    """Demonstrate working with nested schemas."""
    print("\n🎯 Nested Schemas")
    print("=" * 50)
    
    # Create address schema
    address_schema = Schema([
        Field("street", str),
        Field("city", str),
        Field("state", str),
        Field("postal_code", str),
        Field("country", str)
    ])
    
    # Create person schema with nested address
    person_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("address", address_schema)
    ])
    
    print("Address schema:")
    print_schema(address_schema)
    
    print("\nPerson schema with nested address:")
    print_schema(person_schema)
    
    # Convert to dataclass
    PersonClass = schema_to_dataclass(person_schema, "Person")
    AddressClass = PersonClass.__annotations__["address"]
    
    # Create instances
    address = AddressClass(
        street="123 Main St",
        city="Anytown",
        state="CA",
        postal_code="90210",
        country="USA"
    )
    
    person = PersonClass(
        id=1,
        name="John Doe",
        address=address
    )
    
    print(f"\nCreated person: {person}")
    print(f"Person's city: {person.address.city}")
    
    return person_schema


def demo_real_world_example():
    """Demonstrate a real-world e-commerce schema system."""
    print("\n🛒 Real-World E-commerce Example")
    print("=" * 50)
    
    # Category schema
    category_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("slug", str),
        Field("description", str | None),
        Field("parent_id", Annotated[int | None, Reference[int]()]),
        Field("is_active", bool),
        Field("created_at", datetime)
    ])
    
    # Product schema
    product_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("name", str),
        Field("slug", str),
        Field("description", str | None),
        Field("price", float),
        Field("category_id", Annotated[int, Reference[int]()]),
        Field("sku", str),
        Field("stock_quantity", int),
        Field("is_active", bool),
        Field("created_at", datetime),
        Field("updated_at", datetime | None)
    ])
    
    # Order schema
    order_schema = Schema([
        Field("id", Annotated[int, PrimaryKey()]),
        Field("customer_email", str),
        Field("total_amount", float),
        Field("status", str),
        Field("created_at", datetime),
        Field("shipped_at", datetime | None)
    ])
    
    print("E-commerce schemas created:")
    print(f"📁 Categories: {len(category_schema.fields)} fields")
    print(f"📦 Products: {len(product_schema.fields)} fields")
    print(f"🛒 Orders: {len(order_schema.fields)} fields")
    
    # Generate SQL for all tables
    print("\nGenerated SQL tables:")
    
    print("\n1. Categories table:")
    print(schema_to_sql(category_schema, "categories"))
    
    print("\n2. Products table:")
    print(schema_to_sql(product_schema, "products"))
    
    print("\n3. Orders table:")
    print(schema_to_sql(order_schema, "orders"))
    
    # Convert to dataclasses and create sample data
    CategoryClass = schema_to_dataclass(category_schema, "Category")
    ProductClass = schema_to_dataclass(product_schema, "Product")
    OrderClass = schema_to_dataclass(order_schema, "Order")
    
    # Create sample instances
    category = CategoryClass(
        id=1,
        name="Electronics",
        slug="electronics",
        description="Electronic devices and accessories",
        parent_id=None,
        is_active=True,
        created_at=datetime.now()
    )
    
    product = ProductClass(
        id=101,
        name="Wireless Headphones",
        slug="wireless-headphones",
        description="High-quality wireless headphones with noise cancellation",
        price=199.99,
        category_id=1,
        sku="WH-001",
        stock_quantity=50,
        is_active=True,
        created_at=datetime.now(),
        updated_at=None
    )
    
    order = OrderClass(
        id=1001,
        customer_email="customer@example.com",
        total_amount=199.99,
        status="pending",
        created_at=datetime.now(),
        shipped_at=None
    )
    
    print(f"\n📁 Sample category: {category.name}")
    print(f"📦 Sample product: {product.name} (${product.price})")
    print(f"🛒 Sample order: #{order.id} for {order.customer_email}")
    
    return {
        "category_schema": category_schema,
        "product_schema": product_schema,
        "order_schema": order_schema,
        "instances": {
            "category": category,
            "product": product,
            "order": order
        }
    }


def main():
    """Run all demonstrations."""
    print("🚀 Schema System Demonstration")
    print("=" * 80)
    
    # Run all demonstrations
    user_schema = demo_basic_schema_creation()
    UserClass, user = demo_dataclass_conversion(user_schema)
    product_schema = demo_existing_dataclass_to_schema()
    demo_sql_generation(user_schema)
    modified_schema = demo_schema_operations(user_schema)
    merged_schema = demo_schema_merging()
    nested_schema = demo_nested_schemas()
    ecommerce_data = demo_real_world_example()
    
    print("\n🎉 Demonstration Complete!")
    print("=" * 80)
    print("The schema system successfully demonstrated:")
    print("✓ Schema creation and manipulation")
    print("✓ Dataclass conversion (both directions)")
    print("✓ SQL generation (CREATE, INSERT, SELECT)")
    print("✓ Schema operations (add, remove, rename, merge)")
    print("✓ Schema validation")
    print("✓ Nested schema support")
    print("✓ Real-world usage examples")
    print("\nThe system is ready for use in your projects!")


if __name__ == "__main__":
    main()
