/** "Legends’", "MCGA Gang’s": a name with its possessive. */
export const possessive = (name: string) => `${name}${/s$/i.test(name) ? '’' : '’s'}`;
