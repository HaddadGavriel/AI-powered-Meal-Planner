from fastapi.testclient import TestClient


def login(client: TestClient, email: str = "owner@mealplanner.dev") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "mealplanner-demo"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}
