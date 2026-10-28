"""Compile the public, credential-free workflow manifest into an unsigned plist.

Sign the output with Apple's `shortcuts sign` command before sharing/importing.
This reads only the checked-in manifest, never the installed Shortcuts database.
"""
import json
import pathlib
import plistlib
import sys

source = pathlib.Path(__file__).with_name("workflow.json")
workflow = json.loads(source.read_text())
assert "REPLACE_WITH_FINE_GRAINED_TOKEN" in source.read_text()
assert "github_pat_" not in source.read_text()
output = pathlib.Path(sys.argv[1])
output.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
print(f"Credential-free shortcut compiled: {output}")
