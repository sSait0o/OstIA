import pytest
from unittest.mock import patch
from app.services.job_matcher import _keyword_overlap_score, score_cv_job


class TestKeywordOverlapScore:
    def test_returns_zero_for_empty_skills(self):
        result = _keyword_overlap_score([], "great opportunity in Python and FastAPI")
        assert result == 0.0

    def test_returns_100_when_all_skills_match(self):
        result = _keyword_overlap_score(
            ["Python", "FastAPI"], "we need Python and FastAPI developers"
        )
        assert result == 100.0

    def test_returns_50_when_half_skills_match(self):
        result = _keyword_overlap_score(
            ["Python", "Rust"], "looking for Python developers"
        )
        assert result == 50.0

    def test_is_case_insensitive(self):
        result = _keyword_overlap_score(["python"], "We use Python extensively")
        assert result == 100.0

    def test_uses_word_boundary_matching(self):
        result = _keyword_overlap_score(
            ["Go"], "Django developers are great at good coding"
        )
        assert result == 0.0

    def test_returns_zero_when_no_skills_match(self):
        result = _keyword_overlap_score(
            ["Rust", "Haskell"], "looking for Python and Java developers"
        )
        assert result == 0.0


class TestScoreCvJob:
    def _cv(self, skills=None):
        return {
            "firstName": "Alice",
            "lastName": "Dupont",
            "skills": skills or ["Python", "FastAPI", "PostgreSQL"],
            "experience": [],
            "education": [],
            "summary": "Backend developer",
        }

    @pytest.mark.asyncio
    async def test_returns_ai_result_when_valid(self):
        with patch("app.services.job_matcher.complete_json") as mock:
            mock.return_value = {
                "score": 85,
                "matchedSkills": ["Python", "FastAPI"],
                "missingSkills": ["Kubernetes"],
                "summary": "Strong candidate",
            }
            result = await score_cv_job(
                self._cv(), "Backend Developer", "Python and FastAPI required"
            )

        assert result["score"] == 85
        assert "Python" in result["matchedSkills"]
        assert result["summary"] == "Strong candidate"

    @pytest.mark.asyncio
    async def test_falls_back_to_keyword_score_when_ai_returns_none(self):
        with patch("app.services.job_matcher.complete_json") as mock:
            mock.return_value = None
            result = await score_cv_job(
                self._cv(["Python"]),
                "Backend Developer",
                "We need Python developers",
            )

        assert isinstance(result["score"], int)
        assert result["score"] > 0
        assert "keyword overlap" in result["summary"].lower()

    @pytest.mark.asyncio
    async def test_falls_back_when_ai_returns_no_score_key(self):
        with patch("app.services.job_matcher.complete_json") as mock:
            mock.return_value = {"matchedSkills": ["Python"]}
            result = await score_cv_job(
                self._cv(["Python"]), "Dev", "Python developer role"
            )

        assert "score" in result
        assert "keyword overlap" in result["summary"].lower()

    @pytest.mark.asyncio
    async def test_replaces_invalid_score_with_keyword_score(self):
        with patch("app.services.job_matcher.complete_json") as mock:
            mock.return_value = {
                "score": 150,
                "matchedSkills": [],
                "missingSkills": [],
                "summary": "Bad score",
            }
            result = await score_cv_job(self._cv(["Python"]), "Dev", "Python role")

        assert 0 <= result["score"] <= 100

    @pytest.mark.asyncio
    async def test_handles_empty_skills_gracefully(self):
        with patch("app.services.job_matcher.complete_json") as mock:
            mock.return_value = {
                "score": 20,
                "matchedSkills": [],
                "missingSkills": ["Python"],
                "summary": "Weak candidate",
            }
            result = await score_cv_job(self._cv(skills=[]), "Dev", "Python required")

        assert result["score"] == 20
