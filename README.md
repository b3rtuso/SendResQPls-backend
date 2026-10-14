# SendResQPls — Backend

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)

Server application powering **SendResQPls**, the disaster incident reporting and emergency response system for **MDRRMO Balayan**.

---

## Overview

The backend supports the SendResQPls mobile app and admin dashboard. It handles citizen accounts, incident reporting and dispatch coordination, AI-assisted incident classification, and status notifications.

---

## Features

- **Account Management**: Citizen registration, sign-in, email verification, and password recovery
- **Incident Reporting**: Intake of emergency reports with photos and location
- **Dispatch Coordination**: Status workflow and safeguards against double-dispatch
- **AI-Assisted Triage**: Automatic incident classification and severity ranking
- **Notifications**: Status updates sent to reporters and responders
- **Department Management**: Coordination across BFP, PNP, Medical, Engineering, and MDRRMO Rescue
- **Audit Trail**: Activity logging and resolution history
- **Security**: Authentication, rate limiting, hardened headers, and password hashing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express 5 |

---

## Getting Started

**Prerequisites:** Node.js >= 18, npm >= 9

```bash
npm install
npm run dev     # development
npm run build   # production build
npm start       # run production build
```

> Configuration values are provided by the project maintainers and must never be committed to version control.

---

## License

This project is proprietary. All rights reserved.
