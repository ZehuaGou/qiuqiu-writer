import asyncio
from memos.api.core.database import AsyncSessionLocal
from memos.api.models.system import SystemSetting
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemSetting).where(SystemSetting.key == "llm_models"))
        row = result.scalar_one_or_none()
        if row:
            print(row.value)
        else:
            print("No llm_models found")

if __name__ == "__main__":
    asyncio.run(main())
