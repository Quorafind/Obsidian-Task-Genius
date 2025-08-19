import {
	App,
	CachedMetadata,
	Component,
	debounce,
	FrontMatterCache,
	moment,
	TFile,
} from "obsidian";
import {
	HabitProps,
	ScheduledHabitProps,
	DailyHabitProps,
	CountHabitProps,
	MappingHabitProps,
	BaseHabitProps,
	BaseHabitData,
	BaseDailyHabitData,
	BaseCountHabitData,
	BaseScheduledHabitData,
	BaseMappingHabitData,
} from "../types/habit-card";
import TaskProgressBarPlugin from "../index"; // Assuming HabitTracker is the main plugin class
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
	getDateFromFile,
	appHasDailyNotesPluginLoaded,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";

export class HabitManager extends Component {
	private plugin: TaskProgressBarPlugin;
	habits: HabitProps[] = [];

	constructor(plugin: TaskProgressBarPlugin) {
		super();
		this.plugin = plugin;
	}

	async onload() {
		await this.initializeHabits();
		this.registerEvent(
			this.plugin.app.metadataCache.on(
				"changed",
				(file: TFile, _data: string, cache: CachedMetadata) => {
					if (this.isDailyNote(file)) {
						this.updateHabitCompletions(file, cache);
					}
				}
			)
		);
	}

	async initializeHabits(): Promise<void> {
		const dailyNotes = await this.getDailyNotes();
		const processedHabits = await this.processHabits(dailyNotes);

		console.log("processedHabits", processedHabits);
		this.habits = processedHabits;

		this.plugin.app.workspace.trigger(
			"task-genius:habit-index-updated",
			this.habits
		);
	}

	private convertBaseHabitsToHabitProps(
		baseHabits: BaseHabitData[]
	): HabitProps[] {
		return baseHabits.map((baseHabit) => {
			switch (baseHabit.type) {
				case "daily": {
					const dailyHabit = baseHabit as BaseDailyHabitData;
					return {
						id: dailyHabit.id,
						name: dailyHabit.name,
						description: dailyHabit.description,
						icon: dailyHabit.icon,
						property: dailyHabit.property,
						type: dailyHabit.type,
						completionText: dailyHabit.completionText,
						completions: {},
					} as DailyHabitProps;
				}

				case "count": {
					const countHabit = baseHabit as BaseCountHabitData;
					return {
						id: countHabit.id,
						name: countHabit.name,
						description: countHabit.description,
						icon: countHabit.icon,
						property: countHabit.property,
						type: countHabit.type,
						min: countHabit.min,
						max: countHabit.max,
						notice: countHabit.notice,
						countUnit: countHabit.countUnit,
						completions: {},
					} as CountHabitProps;
				}

				case "scheduled": {
					const scheduledHabit = baseHabit as BaseScheduledHabitData;
					return {
						id: scheduledHabit.id,
						name: scheduledHabit.name,
						description: scheduledHabit.description,
						icon: scheduledHabit.icon,
						type: scheduledHabit.type,
						events: scheduledHabit.events,
						propertiesMap: scheduledHabit.propertiesMap,
						completions: {},
					} as ScheduledHabitProps;
				}

				case "mapping": {
					const mappingHabit = baseHabit as BaseMappingHabitData;
					return {
						id: mappingHabit.id,
						name: mappingHabit.name,
						description: mappingHabit.description,
						icon: mappingHabit.icon,
						property: mappingHabit.property,
						type: mappingHabit.type,
						mapping: mappingHabit.mapping,
						completions: {},
					} as MappingHabitProps;
				}
			}
		});
	}

	private async getDailyNotes(): Promise<TFile[]> {
		const files = getAllDailyNotes();
		return Object.values(files);
	}

	private isDailyNote(file: TFile): boolean {
		try {
			// Use 'day' to specifically target daily notes if weekly/monthly are handled differently
			return getDateFromFile(file, "day") !== null;
		} catch (e) {
			// Handle cases where getDateFromFile might throw error for non-note files
			// console.warn(`Could not determine if file is a daily note: ${file.path}`, e);
			return false;
		}
	}

	private async processHabits(dailyNotes: TFile[]): Promise<HabitProps[]> {
		const habitsWithoutCompletions = this.plugin.settings.habit.habits;

		const convertedHabits = this.convertBaseHabitsToHabitProps(
			habitsWithoutCompletions
		);

		for (const note of dailyNotes) {
			if (!this.isDailyNote(note)) continue; // Skip non-daily notes

			const cache = this.plugin.app.metadataCache.getFileCache(note);
			const frontmatter = cache?.frontmatter;

			if (frontmatter) {
				const dateMoment = getDateFromFile(note, "day");
				if (!dateMoment) continue; // Should not happen due to isDailyNote check, but belts and suspenders
				const date = dateMoment.format("YYYY-MM-DD");

				for (const habit of convertedHabits) {
					if (!habit.completions) habit.completions = {}; // Ensure completions object exists

					switch (habit.type) {
						case "scheduled":
							// Handle scheduled habits (journey habits)
							const scheduledHabit = habit as ScheduledHabitProps;
							const eventMap = habit.propertiesMap || {};
							if (!scheduledHabit.completions[date])
								scheduledHabit.completions[date] = {};

							for (const [
								eventName,
								propertyKey,
							] of Object.entries(eventMap)) {
								if (
									propertyKey &&
									frontmatter[propertyKey as string] !==
										undefined &&
									frontmatter[propertyKey as string] !== ""
								) {
									const value =
										frontmatter[propertyKey as string];
									// 只有当值不为空字符串时才添加到completions
									if (value && value !== "") {
										// Store the raw value or format it as needed
										scheduledHabit.completions[date][
											eventName
										] = value;
									}
								}
							}
							break;

						case "daily":
							// Handle daily habits with custom completion text
							const dailyHabit = habit as DailyHabitProps;

							if (
								habit.property &&
								frontmatter[habit.property] !== undefined &&
								frontmatter[habit.property] !== ""
							) {
								const value = frontmatter[habit.property];
								// If completionText is defined, check if value matches it
								if (dailyHabit.completionText) {
									// If value matches completionText, mark as completed (1)
									// Otherwise, store the actual text value
									if (value === dailyHabit.completionText) {
										dailyHabit.completions[date] = 1;
									} else {
										dailyHabit.completions[date] =
											value as string;
									}
								} else {
									// Default behavior: any non-empty value means completed
									dailyHabit.completions[date] = value
										? 1
										: 0;
								}
								break; // Use the first found property
							}

							break;

						case "count":
							// Handle count habits
							const countHabit = habit as CountHabitProps;
							if (
								countHabit.property &&
								frontmatter[countHabit.property] !==
									undefined &&
								frontmatter[countHabit.property] !== ""
							) {
								const value = frontmatter[countHabit.property];
								// For count habits, try to parse as number
								const numValue = Number(value);
								if (!isNaN(numValue)) {
									countHabit.completions[date] = numValue;
								}
							}
							break;

						case "mapping":
							// Handle mapping habits
							const mappingHabit = habit as MappingHabitProps;
							if (
								mappingHabit.property &&
								frontmatter[mappingHabit.property] !==
									undefined &&
								frontmatter[mappingHabit.property] !== ""
							) {
								const value =
									frontmatter[mappingHabit.property];
								// For mapping habits, try to parse as number
								const numValue = Number(value);
								if (
									!isNaN(numValue) &&
									mappingHabit.mapping[numValue]
								) {
									mappingHabit.completions[date] = numValue;
								}
							}
							break;
					}
				}
			}
		}
		return convertedHabits;
	}

	private updateHabitCompletions(file: TFile, cache: CachedMetadata): void {
		if (!cache?.frontmatter) return;

		const dateMoment = getDateFromFile(file, "day");
		if (!dateMoment) return; // Not a daily note

		const dateStr = dateMoment.format("YYYY-MM-DD");
		let habitsChanged = false;

		const updatedHabits = this.habits.map((habit) => {
			const habitClone = JSON.parse(JSON.stringify(habit)) as HabitProps; // Work on a clone
			if (!habitClone.completions) habitClone.completions = {};

			switch (habitClone.type) {
				case "scheduled":
					// Handle scheduled habits (journey habits)
					const scheduledHabit = habitClone as ScheduledHabitProps;
					const eventMap = habitClone.propertiesMap || {};
					if (!scheduledHabit.completions[dateStr])
						scheduledHabit.completions[dateStr] = {};
					let eventChanged = false;

					for (const [eventName, propertyKey] of Object.entries(
						eventMap
					)) {
						if (
							propertyKey &&
							cache.frontmatter?.[propertyKey as string] !==
								undefined &&
							cache.frontmatter?.[propertyKey as string] !== ""
						) {
							const newValue =
								cache.frontmatter[propertyKey as string] ?? "";
							if (
								newValue !== "" &&
								scheduledHabit.completions[dateStr][
									eventName
								] !== newValue
							) {
								scheduledHabit.completions[dateStr][eventName] =
									newValue;
								eventChanged = true;
							} else if (
								newValue === "" &&
								scheduledHabit.completions[dateStr]?.[
									eventName
								] !== undefined
							) {
								delete scheduledHabit.completions[dateStr][
									eventName
								];
								eventChanged = true;
							}
						} else if (
							scheduledHabit.completions[dateStr]?.[eventName] !==
							undefined
						) {
							delete scheduledHabit.completions[dateStr][
								eventName
							];
							eventChanged = true;
						}
					}
					if (eventChanged) habitsChanged = true;
					break;

				case "daily":
					// Handle daily habits with custom completion text
					const dailyHabit = habitClone as DailyHabitProps;
					let foundDailyProperty = false;

					if (
						dailyHabit.property &&
						cache.frontmatter?.[dailyHabit.property] !==
							undefined &&
						cache.frontmatter?.[dailyHabit.property] !== ""
					) {
						foundDailyProperty = true;
						const value = cache.frontmatter[dailyHabit.property];

						// If completionText is defined, check if value matches it
						if (dailyHabit.completionText) {
							const newValue =
								value === dailyHabit.completionText
									? 1
									: (value as string);
							if (dailyHabit.completions[dateStr] !== newValue) {
								dailyHabit.completions[dateStr] = newValue;
								habitsChanged = true;
							}
						} else {
							// Default behavior: any non-empty value means completed
							const newValue = value ? 1 : 0;
							if (dailyHabit.completions[dateStr] !== newValue) {
								dailyHabit.completions[dateStr] = newValue;
								habitsChanged = true;
							}
						}
						break; // Use the first found property
					}

					if (
						!foundDailyProperty &&
						dailyHabit.completions[dateStr] !== undefined
					) {
						delete dailyHabit.completions[dateStr];
						habitsChanged = true;
					}
					break;

				case "count":
					// Handle count habits
					const countHabit = habitClone as CountHabitProps;
					let foundCountProperty = false;

					if (
						countHabit.property &&
						cache.frontmatter?.[countHabit.property] !==
							undefined &&
						cache.frontmatter?.[countHabit.property] !== ""
					) {
						foundCountProperty = true;
						const value = cache.frontmatter[countHabit.property];
						const numValue = Number(value);

						if (
							!isNaN(numValue) &&
							countHabit.completions[dateStr] !== numValue
						) {
							countHabit.completions[dateStr] = numValue;
							habitsChanged = true;
						}
						break; // Use the first found property
					}

					if (
						!foundCountProperty &&
						countHabit.completions[dateStr] !== undefined
					) {
						delete countHabit.completions[dateStr];
						habitsChanged = true;
					}
					break;

				case "mapping":
					// Handle mapping habits
					const mappingHabit = habitClone as MappingHabitProps;
					let foundMappingProperty = false;

					if (
						mappingHabit.property &&
						cache.frontmatter?.[mappingHabit.property] !==
							undefined &&
						cache.frontmatter?.[mappingHabit.property] !== ""
					) {
						foundMappingProperty = true;
						const value = cache.frontmatter[mappingHabit.property];
						const numValue = Number(value);

						if (
							!isNaN(numValue) &&
							mappingHabit.mapping[numValue] &&
							mappingHabit.completions[dateStr] !== numValue
						) {
							mappingHabit.completions[dateStr] = numValue;
							habitsChanged = true;
						}
						break; // Use the first found property
					}

					if (
						!foundMappingProperty &&
						mappingHabit.completions[dateStr] !== undefined
					) {
						delete mappingHabit.completions[dateStr];
						habitsChanged = true;
					}
					break;
			}

			return habitClone; // Return the updated clone
		});

		if (habitsChanged) {
			// Update state without tracking in history for background updates
			this.habits = updatedHabits;
			this.plugin.app.workspace.trigger(
				"task-genius:habit-index-updated",
				this.habits
			);
		}
	}

	async updateHabitInObsidian(
		updatedHabit: HabitProps,
		date: string
	): Promise<void> {
		const app: App = this.plugin.app;
		const momentDate = moment(date, "YYYY-MM-DD").set("hour", 12);

		console.log(momentDate);
		if (!momentDate.isValid()) {
			console.error(
				`Invalid date format provided: ${date}. Expected YYYY-MM-DD.`
			);
			return;
		}

		let dailyNote: TFile | null = null;
		try {
			console.log(getAllDailyNotes());
			dailyNote = getDailyNote(momentDate, getAllDailyNotes());

			if (!dailyNote) {
				if (!appHasDailyNotesPluginLoaded()) {
					console.error(
						"Daily notes plugin is not loaded. Please enable the Daily Notes plugin in Obsidian."
					);
					return;
				}

				const settings = getDailyNoteSettings();
				if (!settings.folder) {
					console.error(
						"Daily notes folder is not set. Please configure the Daily Notes plugin in Obsidian."
					);
					return;
				}

				try {
					dailyNote = await createDailyNote(momentDate);
				} catch (error) {
					console.error(
						"Trying to use obsidian default create daily note function",
						error
					);

					this.plugin.app.commands.executeCommandById("daily-notes");

					console.log(getAllDailyNotes());

					dailyNote = getDailyNote(momentDate, getAllDailyNotes());
				}
			}
		} catch (error) {
			console.error("Error getting or creating daily note:", error);
			return;
		}

		if (dailyNote) {
			try {
				await app.fileManager.processFrontMatter(
					dailyNote,
					(frontmatter) => {
						const completion = updatedHabit.completions[date];

						switch (updatedHabit.type) {
							case "scheduled":
								// Handle scheduled habits (journey habits)
								const eventMap =
									updatedHabit.propertiesMap || {};
								for (const [
									eventName,
									propertyKey,
								] of Object.entries(eventMap)) {
									if (propertyKey) {
										// Only update if a property key is defined
										if (
											typeof completion === "object" &&
											completion?.[eventName] !==
												undefined &&
											completion?.[eventName] !== ""
										) {
											frontmatter[propertyKey as string] =
												completion[eventName];
										} else {
											// 如果completion不存在，事件名缺失或值为空字符串，删除该属性
											delete frontmatter[
												propertyKey as string
											];
										}
									}
								}
								break;

							case "daily":
								// Handle daily habits with custom completion text
								const dailyHabit =
									updatedHabit as DailyHabitProps;

								if (dailyHabit.property) {
									const keyToUpdate = dailyHabit.property; // Update the primary property

									if (completion !== undefined) {
										// If completionText is defined and completion is 1, use the completionText
										if (
											dailyHabit.completionText &&
											completion === 1
										) {
											frontmatter[keyToUpdate] =
												dailyHabit.completionText;
										} else {
											// Otherwise use the raw value
											frontmatter[keyToUpdate] =
												completion;
										}
									} else {
										// If completion is undefined, remove the property
										delete frontmatter[keyToUpdate];
									}
								} else {
									console.warn(
										`Habit ${updatedHabit.id} has no properties defined in habitKeyMap.`
									);
								}
								break;

							case "count":
								const countHabit =
									updatedHabit as CountHabitProps;
								// Handle count habits
								if (countHabit.property) {
									const keyToUpdate = countHabit.property; // Update the primary property

									if (completion !== undefined) {
										frontmatter[keyToUpdate] = completion;
									} else {
										// If completion is undefined, remove the property
										delete frontmatter[keyToUpdate];
									}
								} else {
									console.warn(
										`Habit ${updatedHabit.id} has no properties defined in habitKeyMap.`
									);
								}
								break;

							case "mapping":
								// Handle mapping habits
								const mappingHabit =
									updatedHabit as MappingHabitProps;
								if (mappingHabit.property) {
									const keyToUpdate = mappingHabit.property; // Update the primary property

									if (
										completion !== undefined &&
										typeof completion === "number" &&
										mappingHabit.mapping[completion]
									) {
										frontmatter[keyToUpdate] = completion;
									} else {
										// If completion is undefined or invalid, remove the property
										delete frontmatter[keyToUpdate];
									}
								} else {
									console.warn(
										`Habit ${updatedHabit.id} has no properties defined in habitKeyMap.`
									);
								}
								break;
						}
					}
				);
			} catch (error) {
				console.error(
					`Error processing frontmatter for ${dailyNote.path}:`,
					error
				);
			}
		} else {
			console.warn(
				`Daily note could not be found or created for date: ${date}`
			);
		}
	}
}
