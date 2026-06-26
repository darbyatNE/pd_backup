import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import jwt from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.AWS_COGNITO_USER_POOL_ID;
export const CLIENT_ID = process.env.AWS_COGNITO_CLIENT_ID;

if (!USER_POOL_ID || !CLIENT_ID) {
  throw new Error('Missing Cognito environment variables: AWS_COGNITO_USER_POOL_ID, AWS_COGNITO_CLIENT_ID');
}

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

const jwksClient = JwksRsa({
  jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 600_000,
});

const getSigningKey = (header) =>
  new Promise((resolve, reject) =>
    jwksClient.getSigningKey(header.kid, (err, key) =>
      err ? reject(err) : resolve(key.getPublicKey())
    )
  );

export const signIn = (email, password) =>
  cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }));

export const signOut = (accessToken) =>
  cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));

export const signUp = (email, password) =>
  cognitoClient.send(new SignUpCommand({
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  }));

export const adminConfirmSignUp = (email) =>
  cognitoClient.send(new AdminConfirmSignUpCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
  }));

export const deleteUser = (email) =>
  cognitoClient.send(new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
  }));

export const verifyToken = async (token) => {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Invalid token');
  const pubKey = await getSigningKey(decoded.header);
  return jwt.verify(token, pubKey, { algorithms: ['RS256'] });
};
