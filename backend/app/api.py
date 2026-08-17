from fastapi import APIRouter

from app.routers import audit, auth, bootstrap, household, invitations

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(household.router)
router.include_router(invitations.router)
router.include_router(bootstrap.router)
router.include_router(audit.router)
