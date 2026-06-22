"use client";

const SESSION_KEY = "ecommerce-admin-session";

type CognitoAuthenticationResult = {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type CognitoResponse = {
  AuthenticationResult?: CognitoAuthenticationResult;
  ChallengeName?: string;
  message?: string;
  __type?: string;
};

type AdminSession = {
  username: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

const cognitoRegion = process.env.NEXT_PUBLIC_COGNITO_REGION;
const cognitoClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

function getCognitoEndpoint(): string {
  if (!cognitoRegion) {
    throw new AdminAuthError(
      "NEXT_PUBLIC_COGNITO_REGION is missing in frontend/.env.local"
    );
  }

  return `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;
}

function getClientId(): string {
  if (!cognitoClientId) {
    throw new AdminAuthError(
      "NEXT_PUBLIC_COGNITO_CLIENT_ID is missing in frontend/.env.local"
    );
  }

  return cognitoClientId;
}

async function initiateAuth(
  authFlow: "USER_PASSWORD_AUTH" | "REFRESH_TOKEN_AUTH",
  authParameters: Record<string, string>
): Promise<CognitoResponse> {
  const response = await fetch(getCognitoEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: authFlow,
      ClientId: getClientId(),
      AuthParameters: authParameters,
    }),
  });

  const data = (await response.json().catch(() => null)) as CognitoResponse | null;

  if (!response.ok) {
    throw new AdminAuthError(
      data?.message || "Không thể đăng nhập Cognito. Kiểm tra lại tài khoản hoặc mật khẩu."
    );
  }

  if (!data) {
    throw new AdminAuthError("Cognito returned an empty response.");
  }

  return data;
}

function saveAdminSession(
  username: string,
  authResult: CognitoAuthenticationResult,
  previousRefreshToken?: string
): AdminSession {
  const idToken = authResult.IdToken;
  const refreshToken = authResult.RefreshToken || previousRefreshToken;
  const expiresIn = authResult.ExpiresIn;

  if (!idToken || !refreshToken || !expiresIn) {
    throw new AdminAuthError("Cognito did not return a valid login session.");
  }

  const session: AdminSession = {
    username,
    idToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  return session;
}

function getStoredAdminSession(): AdminSession | null {
  const rawSession = sessionStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AdminSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function signInAdmin(
  username: string,
  password: string
): Promise<void> {
  const result = await initiateAuth("USER_PASSWORD_AUTH", {
    USERNAME: username,
    PASSWORD: password,
  });

  if (result.ChallengeName) {
    throw new AdminAuthError(
      `Cognito requires an additional step: ${result.ChallengeName}`
    );
  }

  if (!result.AuthenticationResult) {
    throw new AdminAuthError("Không nhận được phiên đăng nhập từ Cognito.");
  }

  saveAdminSession(username, result.AuthenticationResult);
}

export async function getValidAdminIdToken(): Promise<string> {
  const session = getStoredAdminSession();

  if (!session) {
    throw new AdminAuthError("Bạn chưa đăng nhập admin.");
  }

  const tokenStillValid = session.expiresAt > Date.now() + 60_000;

  if (tokenStillValid) {
    return session.idToken;
  }

  const result = await initiateAuth("REFRESH_TOKEN_AUTH", {
    REFRESH_TOKEN: session.refreshToken,
  });

  if (!result.AuthenticationResult) {
    signOutAdmin();
    throw new AdminAuthError("Phiên đăng nhập đã hết hạn.");
  }

  const refreshedSession = saveAdminSession(
    session.username,
    result.AuthenticationResult,
    session.refreshToken
  );

  return refreshedSession.idToken;
}

export function getAdminUsername(): string | null {
  return getStoredAdminSession()?.username || null;
}

export function signOutAdmin(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

