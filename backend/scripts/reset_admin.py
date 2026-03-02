
import asyncio
import sys
from pathlib import Path

# Add src to python path
script_dir = Path(__file__).parent
backend_dir = script_dir.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from sqlalchemy.future import select
from memos.api.core.database import get_async_session
from memos.api.models.admin import AdminUser
from memos.api.core.security import get_password_hash

async def reset_admin():
    async for session in get_async_session():
        result = await session.execute(select(AdminUser).where(AdminUser.username == "admin"))
        admin = result.scalars().first()
        if admin:
            admin.password_hash = get_password_hash("admin123456")
            session.add(admin)
            await session.commit()
            print("✅ Admin password reset to 'admin123456'")
        else:
            print("❌ Admin user not found")

if __name__ == "__main__":
    asyncio.run(reset_admin())
