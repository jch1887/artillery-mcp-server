/**
 * Saved Config Storage Layer
 * 
 * Manages persistence of Artillery test configurations using a file-based
 * storage strategy with a JSON index for metadata.
 * 
 * Storage structure:
 *   $ARTILLERY_WORKDIR/saved-configs/
 *   ├── index.json         # Metadata index
 *   ├── config-name.yml    # Individual config files
 *   └── ...
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

/** Version number for the index schema (for future migrations) */
const INDEX_VERSION = 1;

/** Metadata for a single saved configuration */
export interface SavedConfigEntry {
  /** Unique identifier (slug) for the config */
  name: string;
  /** Human-readable description */
  description?: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when last updated */
  updatedAt: string;
  /** Filename on disk (derived from name) */
  filename: string;
  /** Optional tags for organization */
  tags?: string[];
}

/** The index file schema */
export interface ConfigIndex {
  /** Schema version for future migrations */
  version: number;
  /** Map of config name to entry metadata */
  configs: Record<string, SavedConfigEntry>;
}

/** Input for saving a new config */
export interface SaveConfigInput {
  /** Unique name for the config (will be sanitized) */
  name: string;
  /** The Artillery configuration content (YAML or JSON string) */
  content: string;
  /** Optional description */
  description?: string;
  /** Optional tags */
  tags?: string[];
}

/** Result of listing configs */
export interface ListConfigsResult {
  /** Total number of saved configs */
  count: number;
  /** Array of config entries */
  configs: SavedConfigEntry[];
}

/** Result of getting a config */
export interface GetConfigResult {
  /** The config metadata */
  entry: SavedConfigEntry;
  /** The config content as string */
  content: string;
}

// ============================================================================
// Config Storage Class
// ============================================================================

/**
 * Manages saved Artillery configurations on disk.
 * 
 * Thread-safe for single-process use. Does not provide locking for
 * multi-process scenarios.
 */
export class ConfigStorage {
  private readonly storageDir: string;
  private readonly indexPath: string;

  /**
   * Create a new ConfigStorage instance.
   * @param workDir - The base working directory (usually ARTILLERY_WORKDIR)
   */
  constructor(workDir: string) {
    this.storageDir = path.join(workDir, 'saved-configs');
    this.indexPath = path.join(this.storageDir, 'index.json');
  }

  /**
   * Initialize the storage directory and index file if they don't exist.
   */
  async initialize(): Promise<void> {
    // Create storage directory
    await fs.mkdir(this.storageDir, { recursive: true });

    // Create index file if it doesn't exist
    try {
      await fs.access(this.indexPath);
    } catch {
      // Index doesn't exist, create it
      const emptyIndex: ConfigIndex = {
        version: INDEX_VERSION,
        configs: {}
      };
      await this.writeIndex(emptyIndex);
    }
  }

  /**
   * Save a new configuration or update an existing one.
   * @param input - The config to save
   * @returns The saved config entry
   */
  async save(input: SaveConfigInput): Promise<SavedConfigEntry> {
    await this.initialize();

    // Sanitize and validate the name
    const sanitizedName = this.sanitizeName(input.name);
    if (!sanitizedName) {
      throw new Error('Invalid config name. Use alphanumeric characters, hyphens, and underscores only.');
    }

    // Check name length
    if (sanitizedName.length > 64) {
      throw new Error('Config name must be 64 characters or less.');
    }

    // Read current index
    const index = await this.readIndex();
    const existingEntry = index.configs[sanitizedName];
    const now = new Date().toISOString();

    // Create the entry
    const entry: SavedConfigEntry = {
      name: sanitizedName,
      description: input.description,
      createdAt: existingEntry?.createdAt || now,
      updatedAt: now,
      filename: `${sanitizedName}.yml`,
      tags: input.tags
    };

    // Write the config file
    const configPath = path.join(this.storageDir, entry.filename);
    await fs.writeFile(configPath, input.content, 'utf-8');

    // Update the index
    index.configs[sanitizedName] = entry;
    await this.writeIndex(index);

    return entry;
  }

  /**
   * List all saved configurations.
   * @returns List of config entries with count
   */
  async list(): Promise<ListConfigsResult> {
    await this.initialize();

    const index = await this.readIndex();
    const configs = Object.values(index.configs).sort((a, b) => 
      b.updatedAt.localeCompare(a.updatedAt) // Most recent first
    );

    return {
      count: configs.length,
      configs
    };
  }

  /**
   * Get a specific configuration by name.
   * @param name - The config name
   * @returns The config entry and content
   */
  async get(name: string): Promise<GetConfigResult> {
    await this.initialize();

    const sanitizedName = this.sanitizeName(name);
    if (!sanitizedName) {
      throw new Error('Invalid config name.');
    }

    const index = await this.readIndex();
    const entry = index.configs[sanitizedName];

    if (!entry) {
      throw new Error(`Config not found: ${sanitizedName}`);
    }

    // Read the config file
    const configPath = path.join(this.storageDir, entry.filename);
    const content = await fs.readFile(configPath, 'utf-8');

    return { entry, content };
  }

  /**
   * Delete a saved configuration.
   * @param name - The config name to delete
   * @returns True if deleted, false if not found
   */
  async delete(name: string): Promise<boolean> {
    await this.initialize();

    const sanitizedName = this.sanitizeName(name);
    if (!sanitizedName) {
      throw new Error('Invalid config name.');
    }

    const index = await this.readIndex();
    const entry = index.configs[sanitizedName];

    if (!entry) {
      return false;
    }

    // Delete the config file
    const configPath = path.join(this.storageDir, entry.filename);
    try {
      await fs.unlink(configPath);
    } catch {
      // File might not exist, continue with index cleanup
    }

    // Remove from index
    delete index.configs[sanitizedName];
    await this.writeIndex(index);

    return true;
  }

  /**
   * Check if a config exists.
   * @param name - The config name
   * @returns True if exists
   */
  async exists(name: string): Promise<boolean> {
    await this.initialize();

    const sanitizedName = this.sanitizeName(name);
    if (!sanitizedName) {
      return false;
    }

    const index = await this.readIndex();
    return sanitizedName in index.configs;
  }

  /**
   * Get the full path to a saved config file.
   * Useful for passing to Artillery CLI.
   * @param name - The config name
   * @returns Absolute path to the config file
   */
  async getConfigPath(name: string): Promise<string> {
    const { entry } = await this.get(name);
    return path.join(this.storageDir, entry.filename);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Sanitize a config name to be safe for filesystem use.
   * Allows alphanumeric, hyphens, and underscores.
   */
  private sanitizeName(name: string): string {
    // Trim and convert to lowercase
    const trimmed = name.trim().toLowerCase();
    
    // Replace spaces with hyphens
    const normalized = trimmed.replace(/\s+/g, '-');
    
    // Remove any characters that aren't alphanumeric, hyphens, or underscores
    const sanitized = normalized.replace(/[^a-z0-9_-]/g, '');
    
    // Remove leading/trailing hyphens
    return sanitized.replace(/^-+|-+$/g, '');
  }

  /**
   * Read and parse the index file.
   */
  private async readIndex(): Promise<ConfigIndex> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const index = JSON.parse(content) as ConfigIndex;
      
      // Basic validation
      if (!index.version || !index.configs) {
        throw new Error('Invalid index format');
      }
      
      return index;
    } catch (error) {
      // If index is corrupted, start fresh
      const emptyIndex: ConfigIndex = {
        version: INDEX_VERSION,
        configs: {}
      };
      await this.writeIndex(emptyIndex);
      return emptyIndex;
    }
  }

  /**
   * Write the index file atomically.
   */
  private async writeIndex(index: ConfigIndex): Promise<void> {
    const content = JSON.stringify(index, null, 2);
    
    // Write to temp file first for atomic operation
    const tempPath = `${this.indexPath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.indexPath);
  }
}




