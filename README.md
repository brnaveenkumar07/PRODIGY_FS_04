# ChatApp

ChatApp is a full-stack real-time messaging application built with Next.js, React, Socket.IO, Prisma, and PostgreSQL. It supports public chat rooms, private rooms, direct messaging, user authentication, persistent message history, file sharing, and live presence updates.

The project is designed as a modern web chat platform with a clean interface and a backend that combines REST APIs for persistence with WebSockets for real-time communication.

## Features

- Secure user registration and login with JWT-based authentication
- Public and private chat rooms
- One-to-one direct messaging between users
- Real-time message delivery with Socket.IO
- Live online/offline presence indicators
- Typing indicators for active conversations
- Persistent message history stored in PostgreSQL
- Infinite scroll for older messages
- File attachment uploads with validation and size limits
- Protected routes and authenticated API access
- Basic in-memory rate limiting for key API endpoints

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript
- Styling: Tailwind CSS v4, shadcn/ui
- Backend: Next.js App Router APIs, custom Node HTTP server
- Real-time communication: Socket.IO
- Database: PostgreSQL
- ORM: Prisma
- Validation: Zod
- Authentication: JWT stored in secure HTTP-only cookies

## Project Structure

```text
ChatApp/
|-- prisma/                  # Prisma schema and migrations
|-- public/uploads/          # Uploaded attachments
|-- src/app/                 # App Router pages and API routes
|-- src/components/          # Reusable UI and auth components
|-- src/lib/                 # Auth, Prisma, sockets, validation, helpers
|-- middleware.ts            # Route protection middleware
|-- server.ts                # Custom Next.js + Socket.IO server
|-- package.json
```

## How It Works

ChatApp uses a custom Node server to run the Next.js application and initialize Socket.IO on the same HTTP server. Authentication is handled with JWT tokens stored in cookies, and Prisma manages all communication with the PostgreSQL database.

Messages can be sent in chat rooms or as direct messages. They are stored in the database for persistence and also emitted in real time through Socket.IO so connected users receive updates instantly.

## Database Models

The application is centered around three core models:

- `User`: stores account details and relationships to messages and created rooms
- `Room`: stores public/private room metadata
- `Message`: stores room messages, direct messages, and optional file attachment URLs

## Environment Variables

Create a `.env` file in the project root and add the following:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/chatapp"
JWT_SECRET="your-super-secret-key-with-at-least-32-characters"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NODE_ENV="development"
```

### Variable Notes

- `DATABASE_URL`: PostgreSQL connection string used by Prisma
- `JWT_SECRET`: secret key used to sign authentication tokens
- `NEXT_PUBLIC_APP_URL`: public app URL for client-side usage
- `PORT`: port used by the custom server
- `NODE_ENV`: runtime environment

## Installation

1. Clone the repository:

```bash
git clone <your-repository-url>
cd ChatApp
```

2. Install dependencies:

```bash
npm install
```

3. Configure the environment variables in `.env`.

4. Apply the database migration:

```bash
npm run db:migrate
```

5. Start the development server:

```bash
npm run dev
```

6. Open the app in your browser:

```text
http://localhost:3000
```

## Available Scripts

- `npm run dev` - Start the development server with the custom Socket.IO server
- `npm run build` - Generate Prisma client and build the production app
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run Prisma development migrations
- `npm run db:push` - Push schema changes directly to the database
- `npm run db:deploy` - Deploy Prisma migrations in production

## API Overview

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate a user
- `POST /api/auth/logout` - Logout the current user
- `GET /api/auth/me` - Get the current authenticated user

### Chat

- `GET /api/rooms` - Fetch available chat rooms
- `POST /api/rooms` - Create a new room
- `GET /api/messages` - Fetch room or direct message history
- `POST /api/messages` - Create a room message or direct message
- `GET /api/users` - Fetch other users with online status
- `POST /api/upload` - Upload message attachments

## Real-Time Events

Socket.IO is used for:

- Joining and leaving rooms
- Sending room messages
- Sending private messages
- Typing indicators
- Online/offline presence updates

## Security and Validation

- Route protection is enforced through middleware
- Authenticated APIs require a valid JWT cookie
- Request payloads are validated with Zod
- Passwords are hashed before storage
- File uploads are validated by type and limited to 25 MB
- Basic rate limiting is applied to important endpoints

## Deployment Notes

Before deploying, make sure:

- PostgreSQL is available in the target environment
- All required environment variables are configured
- Prisma migrations have been applied
- The deployment setup supports running the custom `server.ts`
- Persistent file storage is configured if you want uploaded files to survive redeployments

## Future Improvements

- Message read receipts
- User profile customization
- Better production-grade rate limiting with Redis
- Cloud file storage integration
- Room membership and invitation system
- Search across messages and conversations

## License

This project is available for learning, customization, and further development. Add a license such as MIT if you plan to publish it as an open-source repository.

Live Demo: https://chat-app-naveen.vercel.app/login
