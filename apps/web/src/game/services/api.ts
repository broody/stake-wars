import axios from 'axios';
import { config } from './config';
import type { ArtData, MintedData, OwnerData } from '../types';

export const api = {
  async getUnknown(id: number): Promise<unknown> {
    try {
      const response = await axios.get(`${config.domain}/api/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching unknown:', error);
      throw error;
    }
  },

  async getArt(): Promise<ArtData[]> {
    try {
      const response = await axios.get(`${config.domain}/api/getart/`);
      return response.data.arts;
    } catch (error) {
      console.error('Error fetching art:', error);
      return [];
    }
  },

  async getData(owner: string): Promise<OwnerData> {
    try {
      const response = await axios.get(`${config.domain}/api/getdata/${owner}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching owner data:', error);
      return { owned: [] };
    }
  },

  async getMinted(): Promise<MintedData> {
    try {
      const response = await axios.get(`${config.domain}/getminted/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching minted data:', error);
      return { minted: [] };
    }
  },

  async uploadArt(formData: FormData): Promise<{ artId: string }> {
    try {
      const response = await axios.post(
        `${config.domain}/api/uploadart`,
        formData
      );
      return response.data;
    } catch (error) {
      console.error('Error uploading art:', error);
      throw error;
    }
  },
};
