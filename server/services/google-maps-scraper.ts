import { Client } from '@googlemaps/google-maps-services-js';
import { storage } from '../storage';
import { getConnection } from './channels/whatsapp';



export const GOOGLE_MAPS_SCRAPE_MAX_RESULTS = 700;


const MAX_VARIANTS = 10; // Limit to avoid quota issues
const PER_VARIANT_CAP = 140; // ~2x single-query max for diversity
const MAX_TOTAL_QUERIES = 20; // Safety cap on Text Search calls

interface ScrapedContact {
  phoneNumber: string;
  jid: string;
  profilePicture?: string;
  name?: string;
}

interface ScrapingProgress {
  type: 'started' | 'query_expanded' | 'place_found' | 'checking_number' | 'contact_found' | 'number_invalid' | 'number_error' | 'completed' | 'error';
  message?: string;
  placeName?: string;
  phoneNumber?: string;
  contact?: ScrapedContact;
  totalChecked?: number;
  validCount?: number;
  progress?: number;
  totalToCheck?: number;
  errors?: string[];
  error?: string;
  validNumbers?: ScrapedContact[];
}

export async function scrapeGoogleMapsContactsWithProgress(
  connectionId: number,
  searchTerm: string,
  maxResults: number,
  progressCallback: (update: ScrapingProgress) => void,
  location?: string
): Promise<{
  validNumbers: ScrapedContact[];
  totalChecked: number;
  errors: string[];
}> {
  const validNumbers: ScrapedContact[] = [];
  const errors: string[] = [];
  let totalChecked = 0;

  try {

    
    const apiKeySetting = await storage.getAppSetting('google_maps_api_key');
    
    
    if (!apiKeySetting) {
      throw new Error('Google Maps API key not configured. Please ask a super administrator to configure it in Admin Settings > Integrations tab.');
    }


    let apiKey: string | undefined;
    
    if (typeof apiKeySetting.value === 'string') {

      apiKey = apiKeySetting.value;
    } else if (apiKeySetting.value && typeof apiKeySetting.value === 'object') {

      apiKey = (apiKeySetting.value as any).apiKey || (apiKeySetting.value as any).value;
    }


    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      console.error('Google Maps API key validation failed:', {
        hasSetting: !!apiKeySetting,
        valueType: typeof apiKeySetting.value,
        value: apiKeySetting.value,
        extractedKey: apiKey
      });
      throw new Error('Google Maps API key not configured. Please ask a super administrator to configure it in Admin Settings > Integrations tab.');
    }


    apiKey = apiKey.trim();


    const sock = getConnection(connectionId);
    if (!sock) {
      throw new Error(`No active WhatsApp connection found for ID ${connectionId}`);
    }

    if (!sock.user?.id) {
      throw new Error('WhatsApp connection is not properly authenticated');
    }


    const client = new Client({});



    const clampedMaxResults = Math.min(maxResults, GOOGLE_MAPS_SCRAPE_MAX_RESULTS);


    progressCallback({
      type: 'started',
      message: location ? 'Starting multi-query Google Maps scraping...' : 'Starting Google Maps scraping...',
      totalToCheck: clampedMaxResults
    });

    let allPlaces: any[] = [];
    const seenPlaceIds = new Set<string>(); // Deduplication by place_id
    let totalQueries = 0;

    if (location) {

      const baseQuery = searchTerm.trim();
      const variants = [
        baseQuery,
        `${baseQuery} near ${location}`,
        `${baseQuery} businesses in ${location}`,
        `${baseQuery} shops ${location}`,
        `${baseQuery} services ${location}`,
        `${baseQuery} companies ${location}`,
        `${baseQuery} restaurants ${location}`,
        `${baseQuery} stores ${location}`,
        `${baseQuery} ${location} area`,
        `${baseQuery} in ${location}`
      ].slice(0, MAX_VARIANTS);

      progressCallback({ 
        type: 'query_expanded', 
        message: `Using ${variants.length} search variants for better coverage` 
      });

      for (const variant of variants) {
        if (totalQueries >= MAX_TOTAL_QUERIES || allPlaces.length >= clampedMaxResults) break;

        let variantPlaces: any[] = [];
        let nextPageToken: string | undefined;
        let variantQueries = 0;

        do {
          if (totalQueries >= MAX_TOTAL_QUERIES) break;

          try {
            const searchResponse = await client.textSearch({
              params: {
                query: variant,
                key: apiKey,
                pagetoken: nextPageToken
              }
            });

            if (searchResponse.data.results) {
              const newPlaces = searchResponse.data.results.filter(place => !seenPlaceIds.has(place.place_id));
              newPlaces.forEach(place => seenPlaceIds.add(place.place_id));
              variantPlaces = variantPlaces.concat(newPlaces);
              totalQueries++; // Count each API call
            }

            nextPageToken = searchResponse.data.next_page_token;


            if (nextPageToken) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }

            variantQueries++;
            if (variantPlaces.length >= PER_VARIANT_CAP || variantQueries >= 3) break; // Per-variant paging cap
          } catch (error: any) {
            const errorMsg = `Error in variant "${variant}": ${error.message || 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
            break;
          }
        } while (nextPageToken && variantPlaces.length < PER_VARIANT_CAP);

        allPlaces = allPlaces.concat(variantPlaces);
        if (allPlaces.length >= clampedMaxResults) break;
      }
    } else {

      progressCallback({ 
        type: 'query_expanded', 
        message: 'Using single search query' 
      });

      let nextPageToken: string | undefined;

      do {
        if (totalQueries >= MAX_TOTAL_QUERIES) break;

        try {
          const searchResponse = await client.textSearch({
            params: {
              query: searchTerm,
              key: apiKey,
              pagetoken: nextPageToken
            }
          });

          if (searchResponse.data.results) {
            const newPlaces = searchResponse.data.results.filter(place => !seenPlaceIds.has(place.place_id));
            newPlaces.forEach(place => seenPlaceIds.add(place.place_id));
            allPlaces = allPlaces.concat(newPlaces);
            totalQueries++;
          }

          nextPageToken = searchResponse.data.next_page_token;


          if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }


          if (allPlaces.length >= clampedMaxResults) {
            break;
          }
        } catch (error: any) {
          const errorMsg = `Error searching Google Maps: ${error.message || 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
          break;
        }
      } while (nextPageToken && allPlaces.length < clampedMaxResults);
    }


    const placesMap = new Map<string, any>();
    for (const place of allPlaces) {
      if (place.place_id && !placesMap.has(place.place_id)) {
        placesMap.set(place.place_id, place);
      }
    }
    const places = Array.from(placesMap.values()).slice(0, clampedMaxResults);

    

    if (places.length === 0) {

      return { validNumbers: [], totalChecked: 0, errors };
    }




    const CONCURRENCY_LIMIT = 4; // Process 4 places in parallel
    const PER_REQUEST_DELAY_MS = 1500; // 1.5 second delay per request to respect Google/WhatsApp rate limits


    const processPlace = async (place: any, placeIndex: number): Promise<{ contact?: ScrapedContact; error?: string }> => {
      try {

        const detailsResponse = await client.placeDetails({
          params: {
            place_id: place.place_id,
            key: apiKey,
            fields: ['formatted_phone_number', 'international_phone_number', 'name', 'formatted_address']
          }
        });

        const placeDetails = detailsResponse.data.result;
        const phoneNumber = placeDetails?.international_phone_number || placeDetails?.formatted_phone_number;

        if (!phoneNumber) {

          return {};
        }


        const cleanPhoneNumber = phoneNumber.replace(/[\s\-\(\)\+]/g, '');


        if (!/^\d{10,15}$/.test(cleanPhoneNumber)) {
          return { error: `Invalid phone format for ${place.name}: ${phoneNumber}` };
        }


        const jid = `${cleanPhoneNumber}@s.whatsapp.net`;
        const results = await sock.onWhatsApp(jid);
        const result = results && results.length > 0 ? results[0] : null;

        if (result && result.exists) {
          const validContact: ScrapedContact = {
            phoneNumber: cleanPhoneNumber,
            jid: result.jid || jid,
            name: placeDetails?.name || place.name || undefined
          };


          try {
            const profilePicUrl = await sock.profilePictureUrl(result.jid || jid, 'image');
            if (profilePicUrl) {
              validContact.profilePicture = profilePicUrl;
            }
          } catch (profileError) {

          }

          return { contact: validContact };
        }

        return {};
      } catch (error: any) {
        return { error: `Error processing place ${place.name || place.place_id}: ${error.message || 'Unknown error'}` };
      }
    };


    const processWithConcurrency = async () => {
      const processingQueue: Array<{ place: any; index: number }> = places.map((place, index) => ({ place, index }));


      const processBatch = async () => {
        while (processingQueue.length > 0) {
          const batch = processingQueue.splice(0, CONCURRENCY_LIMIT);
          const batchPromises = batch.map(async ({ place, index }) => {

            await new Promise(resolve => setTimeout(resolve, PER_REQUEST_DELAY_MS));
            
            const result = await processPlace(place, index);
            return { ...result, placeIndex: index };
          });

          const batchResults = await Promise.all(batchPromises);
          

          for (const result of batchResults) {
            const place = places[result.placeIndex];
            totalChecked++;


            progressCallback({
              type: 'place_found',
              message: `Processing: ${place.name || 'Unknown place'}`,
              placeName: place.name,
              totalChecked,
              validCount: validNumbers.length,
              progress: Math.round((totalChecked / places.length) * 100)
            });

            if (result.error) {
              errors.push(result.error);
              console.error(result.error);
              

              progressCallback({
                type: 'number_error',
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100),
                error: result.error
              });
            } else if (result.contact) {

              progressCallback({
                type: 'checking_number',
                phoneNumber: result.contact.phoneNumber,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });

              validNumbers.push(result.contact);


              progressCallback({
                type: 'contact_found',
                contact: result.contact,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });
            } else {

              if (place.name) {
                progressCallback({
                  type: 'checking_number',
                  phoneNumber: '',
                  totalChecked,
                  validCount: validNumbers.length,
                  progress: Math.round((totalChecked / places.length) * 100)
                });
              }
              
              progressCallback({
                type: 'number_invalid',
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });
            }
          }
        }
      };


      await processBatch();
    };

    await processWithConcurrency();


    return { validNumbers, totalChecked, errors };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error occurred during scraping';
    errors.push(errorMsg);
    progressCallback({
      type: 'error',
      message: errorMsg,
      errors
    });
    throw error;
  }
}

