
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

async def check_admin():
    async for session in get_async_session():
        result = await session.execute(select(AdminUser))
        admins = result.scalars().all()
        print(f"Total Admins: {len(admins)}")
        for admin in admins:
            print(f"ID: {admin.id}, Username: {admin.username}, Email: {admin.email}, Status: {admin.status}")

if __name__ == "__main__":
    asyncio.run(check_admin())
