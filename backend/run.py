# generate_keys.py
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def generate_system_key_pair():
    print("⏳ Generating production-ready RSA 2048-bit key pair...")
    
    # 1. Asymmetric Private Key generate karein
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )

    # 2. Private Key ko PEM format text me convert karein
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')

    # 3. Public Key extract karein
    public_key = private_key.public_key()

    # 4. Public Key ko PEM format text me convert karein
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')

    # 🔥 MAGIC LOGIC: Newlines (\n) ko escape character me convert karein single line ke liye
    single_line_private = pem_private.replace('\n', '\\n')
    single_line_public = pem_public.replace('\n', '\\n')

    print("\n" + "="*20 + " COPY DIRECTLY INTO YOUR .ENV FILE " + "="*20)
    
    print(f'\nSYSTEM_PRIVATE_KEY="{single_line_private}"')
    print(f'\nSYSTEM_PUBLIC_KEY="{single_line_public}"')
    
    print("\n" + "="*75)
    print("💡 Bas upar waali dono lines ko double quotes samet copy karein aur .env me chipka dein!")

if __name__ == "__main__":
    generate_system_key_pair()