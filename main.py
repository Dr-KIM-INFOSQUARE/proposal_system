import os
import sys
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import project

# Windows 환경에서 subprocess 기능을 위해 ProactorEventLoop를 강제로 설정합니다. (NotImplementedError 해결)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI(
    title="PlanWeaver AI API",
    description="Business Plan Analyzer API",
    version="1.0.0"
)

# CORS 구성: 모든 호스트 및 아이피에서의 접속 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

stone_origins = [] # 더 이상 사용하지 않음

# 2. 정적 파일 (PDF 미리보기용)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# 3. 라우터 등록
app.include_router(project.router)

@app.get("/")
async def root():
    return {"message": "Welcome to PlanWeaver AI API"}

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0으로 바인딩하여 모든 인터페이스 허용
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
