"use client";

const SESSION_KEY = "ecommerce-customer-session";
const CUSTOMER_SESSION_CHANGED_EVENT = "ecommerce-customer-session-changed";

function notifyCustomerSessionChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CUSTOMER_SESSION_CHANGED_EVENT));
  }
}

type CognitoAuthenticationResult = {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type CognitoCodeDeliveryDetails = {
  Destination?: string;
  DeliveryMedium?: string;
  AttributeName?: string;
};

type CognitoResponse = {
  AuthenticationResult?: CognitoAuthenticationResult;
  ChallengeName?: string;
  UserConfirmed?: boolean;
  CodeDeliveryDetails?: CognitoCodeDeliveryDetails;
  message?: string;
  __type?: string;
};

type CustomerSession = {
  username: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type CustomerSignUpResult = {
  userConfirmed: boolean;
  deliveryDestination?: string;
};

export class CustomerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerAuthError";
  }
}

const cognitoRegion = process.env.NEXT_PUBLIC_CUSTOMER_COGNITO_REGION;
const cognitoClientId = process.env.NEXT_PUBLIC_CUSTOMER_COGNITO_CLIENT_ID;

function getCognitoEndpoint(): string {
  if (!cognitoRegion) {
    throw new CustomerAuthError(
      "NEXT_PUBLIC_CUSTOMER_COGNITO_REGION is missing in frontend/.env.local"
    );
  }

  return `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;
}

function getClientId(): string {
  if (!cognitoClientId) {
    throw new CustomerAuthError(
      "NEXT_PUBLIC_CUSTOMER_COGNITO_CLIENT_ID is missing in frontend/.env.local"
    );
  }

  return cognitoClientId;
}

async function callCognito(
  target: string,
  body: Record<string, unknown>
): Promise<CognitoResponse> {
  const response = await fetch(getCognitoEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": target,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as
    | CognitoResponse
    | null;

  if (!response.ok) {
    throw new CustomerAuthError(
      data?.message || "Không thể kết nối đến Cognito."
    );
  }

  if (!data) {
    throw new CustomerAuthError("Cognito returned an empty response.");
  }

  return data;
}

function saveCustomerSession(
  username: string,
  authResult: CognitoAuthenticationResult,
  previousRefreshToken?: string
): CustomerSession {
  const idToken = authResult.IdToken;
  const refreshToken = authResult.RefreshToken || previousRefreshToken;
  const expiresIn = authResult.ExpiresIn;

  if (!idToken || !refreshToken || !expiresIn) {
    throw new CustomerAuthError(
      "Cognito did not return a valid customer session."
    );
  }

  const session: CustomerSession = {
    username,
    idToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  notifyCustomerSessionChanged();

  return session;
}

function getStoredCustomerSession(): CustomerSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = sessionStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as CustomerSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    notifyCustomerSessionChanged();

    return null;
  }
}

export async function signUpCustomer(
  email: string,
  password: string
): Promise<CustomerSignUpResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new CustomerAuthError("Vui lòng nhập email.");
  }

  if (password.length < 8) {
    throw new CustomerAuthError("Mật khẩu phải có ít nhất 8 ký tự.");
  }

  const result = await callCognito(
    "AWSCognitoIdentityProviderService.SignUp",
    {
      ClientId: getClientId(),
      Username: normalizedEmail,
      Password: password,
      UserAttributes: [
        {
          Name: "email",
          Value: normalizedEmail,
        },
      ],
    }
  );

  return {
    userConfirmed: Boolean(result.UserConfirmed),
    deliveryDestination: result.CodeDeliveryDetails?.Destination,
  };
}

export async function confirmCustomerSignUp(
  email: string,
  confirmationCode: string
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = confirmationCode.trim();

  if (!normalizedEmail || !code) {
    throw new CustomerAuthError("Vui lòng nhập email và mã xác minh.");
  }

  await callCognito(
    "AWSCognitoIdentityProviderService.ConfirmSignUp",
    {
      ClientId: getClientId(),
      Username: normalizedEmail,
      ConfirmationCode: code,
    }
  );
}

export async function resendCustomerConfirmationCode(
  email: string
): Promise<string | undefined> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new CustomerAuthError("Vui lòng nhập email.");
  }

  const result = await callCognito(
    "AWSCognitoIdentityProviderService.ResendConfirmationCode",
    {
      ClientId: getClientId(),
      Username: normalizedEmail,
    }
  );

  return result.CodeDeliveryDetails?.Destination;
}

export async function signInCustomer(
  email: string,
  password: string
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const result = await callCognito(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: getClientId(),
      AuthParameters: {
        USERNAME: normalizedEmail,
        PASSWORD: password,
      },
    }
  );

  if (result.ChallengeName) {
    throw new CustomerAuthError(
      `Cognito requires an additional step: ${result.ChallengeName}`
    );
  }

  if (!result.AuthenticationResult) {
    throw new CustomerAuthError("Không nhận được phiên đăng nhập.");
  }

  saveCustomerSession(normalizedEmail, result.AuthenticationResult);
}

export async function getValidCustomerIdToken(): Promise<string> {
  const session = getStoredCustomerSession();

  if (!session) {
    throw new CustomerAuthError("Bạn chưa đăng nhập.");
  }

  const tokenStillValid = session.expiresAt > Date.now() + 60_000;

  if (tokenStillValid) {
    return session.idToken;
  }

  const result = await callCognito(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: getClientId(),
      AuthParameters: {
        REFRESH_TOKEN: session.refreshToken,
      },
    }
  );

  if (!result.AuthenticationResult) {
    signOutCustomer();

    throw new CustomerAuthError("Phiên đăng nhập đã hết hạn.");
  }

  const refreshedSession = saveCustomerSession(
    session.username,
    result.AuthenticationResult,
    session.refreshToken
  );

  return refreshedSession.idToken;
}

export function getCustomerUsername(): string | null {
  return getStoredCustomerSession()?.username || null;
}

export function signOutCustomer(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }

  notifyCustomerSessionChanged();
}

export function subscribeToCustomerSession(
  listener: () => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleSessionChanged = () => {
    listener();
  };

  window.addEventListener(
    CUSTOMER_SESSION_CHANGED_EVENT,
    handleSessionChanged
  );

  window.addEventListener("storage", handleSessionChanged);

  return () => {
    window.removeEventListener(
      CUSTOMER_SESSION_CHANGED_EVENT,
      handleSessionChanged
    );

    window.removeEventListener("storage", handleSessionChanged);
  };
}

export function getCustomerSessionSnapshot(): string | null {
  return getCustomerUsername();
}

export function getCustomerSessionServerSnapshot(): string | null {
  return null;
}