import re

def fix_admin():
    file_path = r"e:\project\adaptive-learning-platform\apps\api\src\services\admin\admin.py"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Stub out award_certificate
    content = re.sub(
        r"async def award_certificate[\s\S]*?async def revoke_certificate",
        "async def award_certificate(*args, **kwargs):\n    raise Exception('Legacy removed')\n\n\nasync def revoke_certificate",
        content,
        flags=re.MULTILINE
    )

    # Stub out revoke_certificate
    content = re.sub(
        r"async def revoke_certificate[\s\S]*?async def get_user_certificates",
        "async def revoke_certificate(*args, **kwargs):\n    raise Exception('Legacy removed')\n\n\n# -- Certification endpoints (read-only) --------------------------------------\n\n\nasync def get_user_certificates",
        content,
        flags=re.MULTILINE
    )

    # Stub out get_user_certificates
    content = re.sub(
        r"async def get_user_certificates[\s\S]*?# -- User provisioning",
        "async def get_user_certificates(*args, **kwargs):\n    return []\n\n\n# -- User provisioning",
        content,
        flags=re.MULTILINE
    )

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)


def fix_router():
    file_path = r"e:\project\adaptive-learning-platform\apps\api\src\routers\admin.py"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Stub out api_admin_get_user_certificates
    content = re.sub(
        r"@router\.get\(\s*\"/\{org_slug\}/certifications/\{user_id\}\"[\s\S]*?async def api_admin_get_user_certificates[\s\S]*?return \[CertificateItem\(\*\*r\) for r in results\]",
        "",
        content,
        flags=re.MULTILINE
    )

    # Note: complete_activity and complete_course are still needed, just without certifications.
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

fix_admin()
fix_router()
print("Cleaned admin logic.")
