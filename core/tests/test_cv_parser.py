import pytest
from unittest.mock import patch
from app.services.cv_parser import _strip_html, parse_email, extract_cv


def test_strip_html_removes_tags():
    result = _strip_html("<p>Hello <b>World</b></p>")
    assert "<" not in result
    assert "Hello" in result
    assert "World" in result


def test_strip_html_removes_script():
    result = _strip_html("<script>alert('xss')</script>Safe content")
    assert "alert" not in result
    assert "Safe content" in result


def test_strip_html_removes_style():
    result = _strip_html("<style>.a{color:red}</style>Text")
    assert "color" not in result
    assert "Text" in result


def test_strip_html_decodes_entities():
    result = _strip_html("Hello&nbsp;World &amp; Friends")
    assert "&nbsp;" not in result
    assert "&amp;" not in result
    assert "Hello" in result


def test_strip_html_collapses_whitespace():
    result = _strip_html("<p>  too   many   spaces  </p>")
    assert "  " not in result
    assert result == result.strip()


class TestParseEmail:
    @pytest.mark.asyncio
    async def test_returns_none_for_non_recruitment_email(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {"not_recruitment": True}
            result = await parse_email("Invoice #123", "Please pay $200", "msg-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_company_and_no_job_title(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {"company": None, "jobTitle": None, "status": "APPLIED"}
            result = await parse_email("Some email", "body", "msg-2")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_invalid_status(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "company": "Acme",
                "jobTitle": "Dev",
                "status": "INVALID",
            }
            result = await parse_email("Subject", "body", "msg-3")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_parsed_application_for_valid_email(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "company": "Google",
                "jobTitle": "Software Engineer",
                "status": "APPLIED",
                "location": "Paris",
                "appliedAt": "2024-01-15",
                "notes": "Applied via LinkedIn",
            }
            result = await parse_email("Job Application", "Dear applicant...", "msg-4")

        assert result is not None
        assert result["company"] == "Google"
        assert result["jobTitle"] == "Software Engineer"
        assert result["status"] == "APPLIED"
        assert result["location"] == "Paris"
        assert result["emailId"] == "msg-4"
        assert result["source"] == "EMAIL"

    @pytest.mark.asyncio
    async def test_falls_back_to_unknown_when_company_is_none_but_title_present(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "company": None,
                "jobTitle": "Developer",
                "status": "ACKNOWLEDGED",
            }
            result = await parse_email(
                "Candidature reçue", "Nous avons bien reçu...", "msg-5"
            )

        assert result is not None
        assert result["company"] == "Unknown"

    @pytest.mark.asyncio
    async def test_falls_back_to_unknown_when_job_title_is_none_but_company_present(
        self,
    ):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "company": "Capgemini",
                "jobTitle": None,
                "status": "INTERVIEW",
            }
            result = await parse_email(
                "Interview invite", "We'd like to meet you", "msg-6"
            )

        assert result is not None
        assert result["jobTitle"] == "Unknown"

    @pytest.mark.asyncio
    async def test_accepts_all_valid_statuses(self):
        valid_statuses = [
            "APPLIED",
            "ACKNOWLEDGED",
            "INTERVIEW",
            "TECHNICAL",
            "OFFER",
            "REJECTED",
        ]
        for status in valid_statuses:
            with patch("app.services.cv_parser.complete_json") as mock:
                mock.return_value = {
                    "company": "Corp",
                    "jobTitle": "Dev",
                    "status": status,
                }
                result = await parse_email("Email", "body", f"msg-{status}")
            assert result is not None, f"Expected result for status {status}"
            assert result["status"] == status

    @pytest.mark.asyncio
    async def test_truncates_body_to_max_email_length(self):
        long_body = "x" * 10000
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "company": "Corp",
                "jobTitle": "Dev",
                "status": "APPLIED",
            }
            await parse_email("Subject", long_body, "msg-7")
            call_prompt = mock.call_args[0][0]
        assert len(call_prompt) < len(long_body)


class TestExtractCv:
    @pytest.mark.asyncio
    async def test_returns_dict_from_ai(self):
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {
                "firstName": "Alice",
                "lastName": "Dupont",
                "email": "alice@example.com",
                "skills": ["Python", "FastAPI"],
                "experience": [],
                "education": [],
                "summary": "Experienced developer",
            }
            result = await extract_cv("Alice Dupont\nPython developer")

        assert result["firstName"] == "Alice"
        assert "Python" in result["skills"]

    @pytest.mark.asyncio
    async def test_truncates_long_cv_text(self):
        long_text = "x" * 10000
        with patch("app.services.cv_parser.complete_json") as mock:
            mock.return_value = {}
            await extract_cv(long_text)
            call_prompt = mock.call_args[0][0]
        assert "x" * 4001 not in call_prompt
