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

# 1. CORS 구성을 앱 최상단에 배치 (지연 방지)
# 프론트엔드 도메인과 127.0.0.1 모두 명시적으로 허용
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 개발 중에는 전체 허용
    allow_credentials=True, # 쿠키 사용 가능성 대비
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

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
