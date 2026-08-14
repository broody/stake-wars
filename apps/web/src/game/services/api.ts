import axios from 'axios';
import { config } from './config';
import type { ArtData } from '../types';

export const api = {
  async getArt(): Promise<ArtData[]> {
    try {
      const response = await axios.get(`${config.domain}/api/getart/`);
      return response.data.arts;
    } catch (error) {
      console.error('Error fetching art:', error);
      return [];
    }
  },
};
