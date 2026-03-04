# Prompt for AI Developer Agent

**Role:** You are an Expert Full-Stack Developer and AI Engineer. Your task is to architect and build a commercial-grade, B2B SaaS web application designed for financial underwriters and mortgage advisors. 

**Application Concept:** The application is an **AI-Powered Mortgage & Contract Validation Engine**. It allows users to upload complex financial applications or contracts (e.g., AMA contracts, mortgage JSON payloads) and uses an LLM-based evaluation engine to validate these documents against a dynamic, database-stored set of business policies (e.g., Loan-to-Value limits, income requirements, BKR risk checks). 

### 🛠 Tech Stack Requirements
* **Frontend:** React (Next.js preferred for routing/frontend APIs), Tailwind CSS, and a premium component library (e.g., Shadcn UI, Headless UI, or Radix) for a sleek, enterprise-grade look.
* **Backend:** C# with ASP.NET Core (Web API) to handle robust document processing, business logic, API endpoints, and AI orchestration.
* **Database:** PostgreSQL or SQL Server, using Entity Framework Core (EF Core) as the ORM to store Policies, Users, and Evaluation Results.
* **AI Integration:** OpenAI API (GPT-4o) or Anthropic API (Claude 3.5 Sonnet) using structured outputs (JSON schema) for the evaluation engine. (Consider using Microsoft Semantic Kernel or the official Azure/OpenAI .NET SDKs).

### 📋 Core Features & Requirements

**1. Policy Management Module (CRUD & Merge)**
* **View & Filter:** A datatable UI to view all existing business policies, categorized by type (e.g., Eligibility, Risk, Income, Collateral).
* **Create & Merge:** A form for users to define new policies using natural language. The C# backend must use AI to parse the new policy, check for conflicts with existing policies, and merge/append it to the database seamlessly.
* **Versioning:** Maintain a history of policy changes to ensure auditability.

**2. Document Upload & Parsing**
* **Drag-and-Drop Interface:** A premium, smooth file upload zone accepting JSON (structured application data) or PDF (AMA contracts).
* **Data Extraction:** If a PDF is uploaded, use document intelligence (e.g., Azure Document Intelligence or LLM vision/text extraction) to extract the key financial parameters into a structured JSON/C# Object format before evaluation.

**3. AI Evaluation Engine**
* **The Core Logic:** Once a document/JSON is uploaded, the ASP.NET Core backend must retrieve the active policies from the database via EF Core. It will then pass both the *structured application data* and the *policies* to the LLM via a carefully engineered prompt.
* **Structured Output:** The AI must return a strict JSON payload that deserializes cleanly into a C# record/class containing:
    * Overall Verdict (APPROVED, REJECTED, MANUAL_REVIEW).
    * Passed Checks (with references to the specific policy code).
    * Failed Checks (with clear, actionable reasons).
    * Warnings (potential edge cases, e.g., foreign property ownership).

**4. Premium Results Dashboard (UI/UX)**
* **Human-Readable Output:** Do not just dump raw JSON on the screen. Translate the AI's evaluation into a concise, human-readable summary on the frontend.
* **Visual Status Indicators:** Use traffic-light color coding (Green for Pass, Red for Fail, Amber for Warning) styled elegantly with Tailwind.
* **Expandable Details:** Allow the user to click into specific failed checks to see exactly which policy was violated, what the submitted value was, and what the policy required.

### 🏗 Architectural & Code Quality Guidelines
1. **Component Driven:** Build reusable UI components (Buttons, Cards, Badges, Modals) using Tailwind and ensure they are fully responsive.
2. **Backend Patterns:** Use standard .NET enterprise patterns (Dependency Injection, Repository Pattern if applicable, MediatR for CQRS if you prefer, and strongly typed configuration).
3. **State Management:** Use modern React hooks and state management (e.g., React Query for data fetching and caching).
4. **Error Handling:** Implement robust global exception handling in the ASP.NET Core API, error boundaries in the frontend, and graceful degradation in the AI evaluation loop (e.g., retry logic if the LLM output is malformed).
5. **Security:** Ensure uploaded documents are processed securely in-memory and not permanently stored on disk unless explicitly required by the user. 

### 🚀 Step 1: Your First Output
Please acknowledge this prompt and provide:
1. A proposed database schema (e.g., C# Entity classes for EF Core) for the `Policy` and `EvaluationResult` models.
2. A high-level system architecture diagram (text-based) detailing the flow from file upload -> ASP.NET Core API -> AI evaluation -> DB storage -> UI render.
3. A list of the primary React components you plan to build for the dashboard.