import subprocess

# Only change the following elements by hand.
# VERSION is constructed from these.
MAJOR = 0
MINOR = 2
PATCH = 0
# Do not bump or change elements below.

def scm_version(silent = False):
    try:
        return subprocess.check_output(
                ['git', 'describe', '--tags', '--dirty=+'],
                stderr = subprocess.DEVNULL
            ).decode('UTF-8').strip()
    except subprocess.CalledProcessError as e:
        if not silent:
            print("Could not get git output:", e)

LISTED = '{MAJOR}.{MINOR}.{PATCH}'.format(
        MAJOR=MAJOR, MINOR=MINOR, PATCH=PATCH)

SOURCE = scm_version(silent = True)

# Provide the most explicit available version.
VERSION = SOURCE if SOURCE else LISTED
