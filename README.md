# Wertifix Server

This is the backend server for the Wertifix application. Its primary role is to act as a secure proxy between the frontend application and the Google Gemini API.

## Why a server?

The frontend (the part that runs in the user's browser) should **never** contain sensitive information like an API key. If the API key were in the frontend code, anyone could find it and use it, creating costs on your account.

This server receives requests from the frontend, adds the secret API key securely, and then forwards the request to the Gemini API.

## Setup

1.  **Navigate to the server directory:**
    ```bash
    cd server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    or if you use yarn:
    ```bash
    yarn
    ```

3.  **Create an environment file:**
    Create a file named `.env` inside this `server` directory.

4.  **Add your API Key:**
    Inside the `.env` file, add your Google Gemini API key:
    ```
    API_KEY="YOUR_GEMINI_API_KEY_HERE"
    ```

## Running in Development

To run the backend server while you are developing the frontend, use the following command from within the `server` directory:

```bash
npm run dev
```

This will start the server, typically on `http://localhost:3001`. The frontend development server (run with `npm run dev` in the root directory) is configured to automatically forward API requests to this backend.

## Deployment

To deploy this application, you will need to host both the **frontend** and this **backend**.

-   **Frontend:** The frontend can be built into static files using `npm run build` (in the root directory). These static files (in the `dist` folder) can be hosted on any static hosting provider like Vercel, Netlify, GitHub Pages, etc.
-   **Backend:** This Node.js server needs to be hosted on a platform that can run server-side code, such as:
    -   Vercel (as a Serverless Function)
    -   Netlify (as a Netlify Function)
    -   Google Cloud Run
    -   Heroku
    -   DigitalOcean App Platform

When deploying, you must configure the hosting provider's environment variables to include your `API_KEY`. You will also need to update the `fetch` calls in `src/services/geminiService.ts` to point to your live backend URL instead of the relative `/api` path.
