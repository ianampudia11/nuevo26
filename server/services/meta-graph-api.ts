import axios from 'axios';

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_URL = 'https://graph.facebook.com';

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
}

/**
 * Get user's Facebook Pages
 * @param userAccessToken User's Facebook access token
 * @returns Array of Facebook Pages the user manages
 */
export async function getUserPages(userAccessToken: string): Promise<FacebookPage[]> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/me/accounts`,
      {
        params: {
          fields: 'id,name,access_token,category,picture',
          access_token: userAccessToken
        }
      }
    );

    if (response.data && response.data.data) {
      return response.data.data;
    }

    return [];
  } catch (error: any) {
    console.error('Error fetching user Pages:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Facebook Pages: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get long-lived Page access token
 * @param pageId Facebook Page ID
 * @param userAccessToken User's Facebook access token
 * @param appId Meta App ID
 * @param appSecret Meta App Secret
 * @returns Long-lived Page access token
 */
export async function getPageAccessToken(
  pageId: string,
  userAccessToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  try {

    const longLivedUserTokenResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: userAccessToken
        }
      }
    );

    const longLivedUserToken = longLivedUserTokenResponse.data.access_token;


    const pageResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${pageId}`,
      {
        params: {
          fields: 'access_token',
          access_token: longLivedUserToken
        }
      }
    );

    if (pageResponse.data && pageResponse.data.access_token) {
      return pageResponse.data.access_token;
    }

    throw new Error('Page access token not found in response');
  } catch (error: any) {
    console.error('Error getting Page access token:', error.response?.data || error.message);
    throw new Error(`Failed to get Page access token: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get user's Instagram Business accounts
 * @param userAccessToken User's Facebook access token
 * @returns Array of Instagram Business accounts
 */
export async function getInstagramAccounts(userAccessToken: string): Promise<InstagramAccount[]> {
  try {

    const businessAccountsResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/me/businesses`,
      {
        params: {
          fields: 'id,name',
          access_token: userAccessToken
        }
      }
    );

    if (!businessAccountsResponse.data || !businessAccountsResponse.data.data || businessAccountsResponse.data.data.length === 0) {
      return [];
    }

    const instagramAccounts: InstagramAccount[] = [];


    for (const business of businessAccountsResponse.data.data) {
      try {
        const instagramResponse = await axios.get(
          `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${business.id}/owned_instagram_accounts`,
          {
            params: {
              fields: 'id,username,name,profile_picture_url,account_type',
              access_token: userAccessToken
            }
          }
        );

        if (instagramResponse.data && instagramResponse.data.data) {
          instagramAccounts.push(...instagramResponse.data.data);
        }
      } catch (error: any) {

        console.warn(`Could not fetch Instagram accounts for business ${business.id}:`, error.response?.data?.error?.message || error.message);
      }
    }

    return instagramAccounts;
  } catch (error: any) {
    console.error('Error fetching Instagram accounts:', error.response?.data || error.message);

    if (error.response?.data?.error?.code === 200) {

      return getInstagramAccountsFromPages(userAccessToken);
    }
    throw new Error(`Failed to fetch Instagram accounts: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Alternative method to get Instagram accounts from Pages
 * @param userAccessToken User's Facebook access token
 * @returns Array of Instagram Business accounts
 */
async function getInstagramAccountsFromPages(userAccessToken: string): Promise<InstagramAccount[]> {
  try {
    const pages = await getUserPages(userAccessToken);
    const instagramAccounts: InstagramAccount[] = [];

    for (const page of pages) {
      try {
        const instagramResponse = await axios.get(
          `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${page.id}`,
          {
            params: {
              fields: 'instagram_business_account{id,username,name,profile_picture_url,account_type}',
              access_token: userAccessToken
            }
          }
        );

        if (instagramResponse.data && instagramResponse.data.instagram_business_account) {
          instagramAccounts.push(instagramResponse.data.instagram_business_account);
        }
      } catch (error: any) {

        console.warn(`Page ${page.id} does not have an Instagram Business account`);
      }
    }

    return instagramAccounts;
  } catch (error: any) {
    console.error('Error fetching Instagram accounts from Pages:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Get Instagram access token for an Instagram Business account
 * @param instagramAccountId Instagram Business account ID
 * @param pageAccessToken Page access token (Instagram accounts are linked to Pages)
 * @returns Instagram access token (same as Page access token for Instagram)
 */
export async function getInstagramAccessToken(
  instagramAccountId: string,
  pageAccessToken: string
): Promise<string> {
  try {


    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instagramAccountId}`,
      {
        params: {
          fields: 'id,username',
          access_token: pageAccessToken
        }
      }
    );

    if (response.data && response.data.id) {
      return pageAccessToken;
    }

    throw new Error('Instagram account not found or invalid');
  } catch (error: any) {
    console.error('Error getting Instagram access token:', error.response?.data || error.message);
    throw new Error(`Failed to get Instagram access token: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get Page information
 * @param pageId Facebook Page ID
 * @param accessToken Page access token
 * @returns Page information
 */
export async function getPageInfo(pageId: string, accessToken: string): Promise<any> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${pageId}`,
      {
        params: {
          fields: 'id,name,category,picture,access_token',
          access_token: accessToken
        }
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error fetching Page info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Page info: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get Instagram account information
 * @param instagramAccountId Instagram Business account ID
 * @param accessToken Instagram access token
 * @returns Instagram account information
 */
export async function getInstagramAccountInfo(instagramAccountId: string, accessToken: string): Promise<any> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instagramAccountId}`,
      {
        params: {
          fields: 'id,username,name,profile_picture_url,account_type',
          access_token: accessToken
        }
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error fetching Instagram account info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Instagram account info: ${error.response?.data?.error?.message || error.message}`);
  }
}

