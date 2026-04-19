import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

// Initialize singleton Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

export async function logMeal(phone: string, mealData: any) {
    console.log(`Logging meal for ${phone}: ${mealData.dish}`);

    // Ensure the user exists implicitly if you want, or just log assuming foreign key constraints
    const { data, error } = await supabase.from('meals').insert({
        phone: phone,
        dish: mealData.dish,
        kcal: mealData.kcal,
        protein_g: mealData.protein_g,
        carbs_g: mealData.carbs_g,
        fat_g: mealData.fat_g
    });

    if (error) {
        console.error('Database error logging meal:', error);
        throw error;
    }
    return data;
}

export async function getUserGoal(phone: string): Promise<number> {
    const { data, error } = await supabase
        .from('users')
        .select('daily_goal_kcal')
        .eq('phone', phone)
        .single();

    // Default to 2000 if user doesn't exist or has no explicitly set goal
    if (error || !data) return 2000;
    return data.daily_goal_kcal;
}

export async function getDailyKcalSum(phone: string): Promise<number> {
    // Get beginning of current day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('meals')
        .select('kcal')
        .eq('phone', phone)
        .gte('logged_at', today.toISOString());

    if (error) {
        console.error('Database error fetching daily sum:', error);
        return 0;
    }

    return data.reduce((sum, row) => sum + row.kcal, 0);
}
