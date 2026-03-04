import { NextRequest, NextResponse } from "next/server";

const assessmentConfigurationApiBase =
  process.env.NEXT_PUBLIC_ASSESSMENT_CONFIGURATION_API_URL ??
  "http://localhost:8080";

const normalizedAssessmentConfigurationApi = assessmentConfigurationApiBase.replace(/\/+$/, "");

const assessmentConfigurationApi =
  normalizedAssessmentConfigurationApi.endsWith("/api/v1/configuration")
    ? normalizedAssessmentConfigurationApi
    : `${normalizedAssessmentConfigurationApi}/api/v1/configuration`;

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams.get("active");
  const upstreamParams = new URLSearchParams();

  if (incoming === "true" || incoming === "false") {
    upstreamParams.set("active", incoming);
  }

  const upstreamUrl = `${assessmentConfigurationApi}/get-business-rule-details-list${
    upstreamParams.toString() ? `?${upstreamParams.toString()}` : ""
  }`;

  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          message: "Failed to fetch Assessment business rules",
          upstreamStatus: response.status,
          upstreamPayload: payload,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Assessment business rules proxy failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
