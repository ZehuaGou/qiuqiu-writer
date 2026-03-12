import asyncio
import os
import sys

# Add the parent directory to sys.path so we can import modules from src
# Assuming this script is in backend/scripts/
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
src_dir = os.path.join(backend_dir, "src")

sys.path.append(backend_dir)
sys.path.append(src_dir)

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from memos.api.core.config import get_settings

async def add_columns():
    try:
        settings = get_settings()
        print(f"Connecting to database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
        
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=True,
        )

        async with engine.begin() as conn:
            print("Checking for missing columns in 'users' table...")
            
            # Add plan column
            # plan = Column(String(20), default="free", nullable=False)
            print("Adding 'plan' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free' NOT NULL"))
            
            # Add token_remaining column
            # token_remaining = Column(BigInteger, default=100000, nullable=False)
            print("Adding 'token_remaining' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_remaining BIGINT DEFAULT 100000 NOT NULL"))
            
            # Add token_reset_at column
            # token_reset_at = Column(DateTime(timezone=True), nullable=True)
            print("Adding 'token_reset_at' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_reset_at TIMESTAMPTZ NULL"))
            
            # Add plan_expires_at column
            # plan_expires_at = Column(DateTime(timezone=True), nullable=True)
            print("Adding 'plan_expires_at' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ NULL"))

            # Add last_login_at column
            # last_login_at = Column(DateTime(timezone=True))
            print("Adding 'last_login_at' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL"))

            # Add preferences column
            # preferences = Column(JSON, default=dict)
            print("Adding 'preferences' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON DEFAULT '{}'"))

            # Add status column
            # status = Column(String(20), default="active", index=True)
            print("Adding 'status' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'"))
            
            # Add display_name column
            # display_name = Column(String(100))
            print("Adding 'display_name' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NULL"))

            # Add avatar_url column
            # avatar_url = Column(String(255))
            print("Adding 'avatar_url' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NULL"))

            # Add bio column
            # bio = Column(Text)
            print("Adding 'bio' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NULL"))

        await engine.dispose()
        print("Successfully added columns to 'users' table.")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(add_columns())
