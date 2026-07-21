import bcrypt

class PasswordManager:
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Converts a plain text password into a secure hashed string.
        """
        try:
            # Generate salt and hash the password
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
            return hashed.decode('utf-8')
        except Exception as e:
            raise RuntimeError(f"Password hashing failed: {str(e)}")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        Compares the incoming plain password with the stored hash from database.
        """
        try:
            # Check if the plain password matches the hash
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception:
            # Return False if any encoding or comparison error occurs
            return False