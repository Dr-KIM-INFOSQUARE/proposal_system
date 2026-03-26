from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import project

app = FastAPI(
    title="PlanWeaver AI API",
    description="Business Plan Analyzer API",
    version="1.0.0"
)

# CORS 구성 (프론트엔드 연동 지원)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발용이므로 개방
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(project.router)

if __name__ == "__main__":
    import uvicorn
    # uv run python main.py 로 실행 시 uvicorn 동작
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
