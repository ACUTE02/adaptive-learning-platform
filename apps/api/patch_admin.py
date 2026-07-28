import re

file_path = r"e:\project\adaptive-learning-platform\apps\api\src\services\admin\admin.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove the import of certifications
content = re.sub(
    r"from src\.services\.courses\.certifications import \([\s\S]*?\)\n",
    "",
    content,
    flags=re.MULTILINE
)

# 2. Replace check_course_completion_and_create_certificate call
content = re.sub(
    r"course_completed = await check_course_completion_and_create_certificate\([\s\S]*?\)",
    "course_completed = False  # Legacy certification logic removed",
    content,
    flags=re.MULTILINE
)

# 3. Stub out award_certificate
content = re.sub(
    r"async def award_certificate\([\s\S]*?async def revoke_certificate",
    "async def award_certificate(*args, **kwargs):\n    from fastapi import HTTPException\n    raise HTTPException(status_code=404, detail=\"Legacy feature removed\")\n\n\nasync def revoke_certificate",
    content,
    flags=re.MULTILINE
)

# 4. Stub out revoke_certificate
content = re.sub(
    r"async def revoke_certificate\([\s\S]*?async def get_user_certificates",
    "async def revoke_certificate(*args, **kwargs):\n    from fastapi import HTTPException\n    raise HTTPException(status_code=404, detail=\"Legacy feature removed\")\n\n\n# -- Certification endpoints (read-only) --------------------------------------\n\n\nasync def get_user_certificates",
    content,
    flags=re.MULTILINE
)

# 5. Stub out get_user_certificates
content = re.sub(
    r"async def get_user_certificates\([\s\S]*?async def provision_user",
    "async def get_user_certificates(*args, **kwargs):\n    return []\n\n\n# -- User provisioning --------------------------------------------------------\n\n\nasync def provision_user",
    content,
    flags=re.MULTILINE
)

# 6. We also need to fix 'get_user_trail_detail' and similar if they use legacy Course, but wait, those were not crashing yet. Let's see if we missed anything.

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("admin.py patched successfully")
