# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Email **info@molecare.co.uk**, or open a private
[security advisory](https://github.com/MoleCare/rn-health-data/security/advisories/new)
on this repository, with:

- what the issue is and where in the code it lives
- how to reproduce it
- what an attacker could do with it

You should get an acknowledgement within **3 working days**. We will tell you
when a fix is released and credit you in the release notes, unless you would
rather we did not.

## Supported versions

Security fixes go into the latest release.

## Scope

This package reads health data on the device through HealthKit and Health
Connect. It makes no network calls and stores nothing. In scope:

- anything that sends, stores or logs health values
- asking for more access than the app requested, or for write access
- returning another app's or another person's data as the user's
- anything reachable in its dependencies

Out of scope here (but still worth telling us about at the same address): the
MoleCare apps and API, and bugs in HealthKit, Health Connect or the two peer
libraries themselves.

Never include real health data, or an export of it, in a report.
