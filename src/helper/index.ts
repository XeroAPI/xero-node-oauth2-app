export default class helper {
  public static getRandomNumber(range) {
    return Math.round(Math.random() * ((range || 100) - 1) + 1);
  }
}
