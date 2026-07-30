# Google Play Data safety — Lenswire

Answers aligned with [`docs/privacy.md`](../privacy.md). Lenswire has **no backend**, **no analytics**, and does **not** transmit personal data off-device.

## Data collection overview

| Question                                                            | Answer                           |
| ------------------------------------------------------------------- | -------------------------------- |
| Does your app collect or share any of the required user data types? | **No**                           |
| Is all user data encrypted in transit?                              | N/A (nothing transmitted)        |
| Do you provide a way for users to request data deletion?            | N/A (no account / no cloud data) |

## Permissions justification (App content → Sensitive permissions)

### VPN / network

Used to capture device HTTP(S) traffic locally so the user can inspect it. Captures stay on device. Lenswire does not upload traffic to remote servers.

### Notifications (POST_NOTIFICATIONS) / foreground service

Android foreground service status while the VPN / proxy is running.

### Internet

Required for the local proxy to forward traffic to destination servers on the user’s behalf.

## Content rating

Complete the IARC questionnaire in Play Console. Expected outcome for a developer utility with no social UGC, no violence, no gambling: **Everyone** / low maturity. Answer honestly.

## Ads / target audience

- Contains ads: **No**
- In-app purchases: **No** (unless you add them later)
- Target age: general / 13+ as appropriate for a developer tool
- Designed for children: **No**

## Checklist before sending for review

- [ ] Privacy policy URL set
- [ ] Data safety form submitted (no data collected)
- [ ] Content rating questionnaire completed
- [ ] VPN / network / notifications declarations filled with the text above
- [ ] Feature graphic + icon + ≥2 phone screenshots uploaded
- [ ] AAB uploaded to Internal testing (or Production)
